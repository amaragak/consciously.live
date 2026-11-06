package live.consciously.journalvoicecapture;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Android: record the clip with MediaRecorder (m4a), and run on-device
 * SpeechRecognizer in parallel for live text. The system recognizer uses the
 * voice-recognition audio path; MediaRecorder writes the playable file. We do
 * not also start a browser MediaRecorder from JS.
 */
@CapacitorPlugin(
    name = "JournalVoiceCapture",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class JournalVoiceCapturePlugin extends Plugin {
    private static final String TAG = "JournalVoiceCapture";

    private MediaRecorder recorder;
    private File outFile;
    private SpeechRecognizer speechRecognizer;
    private boolean running = false;
    private long startedAtMs = 0;
    private final ArrayList<Double> peaks = new ArrayList<>();
    private final StringBuilder committed = new StringBuilder();
    private String partial = "";
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable amplitudePoll;
    private boolean restartPending = false;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDevice = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            } catch (Exception e) {
                onDevice = false;
            }
        }
        ret.put("available", available);
        ret.put("onDevice", onDevice);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (running) {
            call.reject("Already recording");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "micPerm");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micPerm(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void begin(PluginCall call) {
        String language = call.getString("language", Locale.getDefault().toLanguageTag());
        try {
            outFile = new File(getContext().getCacheDir(), "journal-voice-" + System.currentTimeMillis() + ".m4a");
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(outFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            committed.setLength(0);
            partial = "";
            peaks.clear();
            startedAtMs = System.currentTimeMillis();
            running = true;
            startAmplitudePoll();
            startRecognizer(language);
            call.resolve();
        } catch (IOException | RuntimeException e) {
            teardown(false);
            call.reject("Failed to start: " + e.getMessage());
        }
    }

    private void startAmplitudePoll() {
        amplitudePoll = new Runnable() {
            @Override
            public void run() {
                if (!running || recorder == null) return;
                try {
                    int amp = recorder.getMaxAmplitude();
                    double level = Math.min(1.0, amp / 16000.0);
                    peaks.add(level);
                    if (peaks.size() > 2400) {
                        peaks.subList(0, peaks.size() - 2400).clear();
                    }
                    JSObject ev = new JSObject();
                    ev.put("level", level);
                    notifyListeners("audioLevel", ev);
                } catch (Exception e) {
                    Log.w(TAG, "amplitude", e);
                }
                main.postDelayed(this, 50);
            }
        };
        main.post(amplitudePoll);
    }

    private SpeechRecognizer createRecognizer() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                if (SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    return SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                }
            } catch (Exception e) {
                Log.w(TAG, "on-device recognizer", e);
            }
        }
        if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
            return SpeechRecognizer.createSpeechRecognizer(getContext());
        }
        return null;
    }

    private void startRecognizer(String language) {
        main.post(() -> {
            destroyRecognizer();
            speechRecognizer = createRecognizer();
            if (speechRecognizer == null) return;
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onError(int error) {
                    // Silence / no-match → restart so continuous dictation continues.
                    if (!running) return;
                    scheduleRestart(language);
                }

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> list = results != null
                        ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        : null;
                    String text = list != null && !list.isEmpty() ? list.get(0) : "";
                    if (text != null && !text.isEmpty()) {
                        if (committed.length() > 0) committed.append(' ');
                        committed.append(text.trim());
                        partial = "";
                        emitPartial(committed.toString(), true);
                    }
                    if (running) scheduleRestart(language);
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> list = partialResults != null
                        ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        : null;
                    String text = list != null && !list.isEmpty() ? list.get(0) : "";
                    partial = text != null ? text.trim() : "";
                    String live = committed.length() == 0
                        ? partial
                        : (partial.isEmpty() ? committed.toString() : committed + " " + partial);
                    emitPartial(live, false);
                }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            }
            try {
                speechRecognizer.startListening(intent);
            } catch (Exception e) {
                Log.w(TAG, "startListening", e);
            }
        });
    }

    private void scheduleRestart(String language) {
        if (restartPending || !running) return;
        restartPending = true;
        main.postDelayed(() -> {
            restartPending = false;
            if (running) startRecognizer(language);
        }, 120);
    }

    private void emitPartial(String text, boolean isFinal) {
        JSObject ev = new JSObject();
        JSArray matches = new JSArray();
        matches.put(text);
        ev.put("matches", matches);
        ev.put("isFinal", isFinal);
        notifyListeners("partialResults", ev);
    }

    /**
     * Post-recording on-device transcription from a saved clip.
     * Uses EXTRA_AUDIO_SOURCE (API 33+) when available; otherwise rejects so
     * JS can fall back to the server Whisper path.
     */
    @PluginMethod
    public void transcribeFile(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing audio");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.reject("On-device file transcription requires Android 13+");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognizer unavailable");
            return;
        }

        String language = call.getString("language", Locale.getDefault().toLanguageTag());
        String mime = call.getString("mimeType", "audio/mp4");
        String ext = "m4a";
        String lower = mime.toLowerCase(Locale.US);
        if (lower.contains("wav")) ext = "wav";
        else if (lower.contains("ogg")) ext = "ogg";
        else if (lower.contains("webm")) ext = "webm";
        else if (lower.contains("amr")) ext = "amr";

        final File tmp = new File(
            getContext().getCacheDir(),
            "journal-transcribe-" + System.currentTimeMillis() + "." + ext
        );
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                fos.write(bytes);
            }
        } catch (IllegalArgumentException | IOException e) {
            call.reject("Could not write audio: " + e.getMessage());
            return;
        }

        main.post(() -> {
            SpeechRecognizer fileRecognizer = null;
            ParcelFileDescriptor pfd = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    fileRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                } else {
                    fileRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                }
                pfd = ParcelFileDescriptor.open(tmp, ParcelFileDescriptor.MODE_READ_ONLY);
                final SpeechRecognizer recognizer = fileRecognizer;
                final ParcelFileDescriptor audioPfd = pfd;
                final boolean[] finished = { false };

                recognizer.setRecognitionListener(new RecognitionListener() {
                    private void done(String transcript, String error) {
                        if (finished[0]) return;
                        finished[0] = true;
                        try { audioPfd.close(); } catch (Exception ignored) {}
                        try { recognizer.destroy(); } catch (Exception ignored) {}
                        //noinspection ResultOfMethodCallIgnored
                        tmp.delete();
                        if (error != null) {
                            call.reject(error);
                            return;
                        }
                        JSObject ret = new JSObject();
                        ret.put("transcript", transcript != null ? transcript : "");
                        ret.put("onDevice", true);
                        call.resolve(ret);
                    }

                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}

                    @Override
                    public void onError(int error) {
                        done(null, "Recognition error " + error);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> list = results != null
                            ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            : null;
                        String text = list != null && !list.isEmpty() ? list.get(0) : "";
                        done(text != null ? text.trim() : "", null);
                    }
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audioPfd);
                recognizer.startListening(intent);

                // Safety timeout — file recognition should finish quickly.
                main.postDelayed(() -> {
                    if (!finished[0]) {
                        try { recognizer.cancel(); } catch (Exception ignored) {}
                        finished[0] = true;
                        try { audioPfd.close(); } catch (Exception ignored) {}
                        try { recognizer.destroy(); } catch (Exception ignored) {}
                        //noinspection ResultOfMethodCallIgnored
                        tmp.delete();
                        call.reject("Recognition timed out");
                    }
                }, 45_000);
            } catch (Exception e) {
                if (pfd != null) {
                    try { pfd.close(); } catch (Exception ignored) {}
                }
                if (fileRecognizer != null) {
                    try { fileRecognizer.destroy(); } catch (Exception ignored) {}
                }
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                call.reject("File transcription failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!running) {
            call.reject("Not recording");
            return;
        }
        running = false;
        if (amplitudePoll != null) {
            main.removeCallbacks(amplitudePoll);
            amplitudePoll = null;
        }
        destroyRecognizer();

        try {
            if (recorder != null) {
                recorder.stop();
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "recorder.stop", e);
        }
        try {
            if (recorder != null) {
                recorder.release();
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "recorder.release", e);
        }
        recorder = null;

        int durationSec = Math.max(1, (int) Math.ceil((System.currentTimeMillis() - startedAtMs) / 1000.0));
        String transcript = committed.toString().trim();
        if (!partial.isEmpty()) {
            transcript = transcript.isEmpty() ? partial : transcript + " " + partial;
        }

        JSObject ret = new JSObject();
        String path = outFile != null ? outFile.getAbsolutePath() : "";
        ret.put("path", path);
        ret.put("uri", path.isEmpty() ? "" : "file://" + path);
        ret.put("mimeType", "audio/mp4");
        ret.put("durationSec", durationSec);
        JSArray peakArr = new JSArray();
        for (Double p : peaks) peakArr.put(p);
        ret.put("peaks", peakArr);
        ret.put("transcript", transcript.trim());
        call.resolve(ret);
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception e) {
                Log.w(TAG, "destroyRecognizer", e);
            }
            speechRecognizer = null;
        }
    }

    private void teardown(boolean keepFile) {
        running = false;
        if (amplitudePoll != null) {
            main.removeCallbacks(amplitudePoll);
            amplitudePoll = null;
        }
        destroyRecognizer();
        if (recorder != null) {
            try { recorder.release(); } catch (Exception ignored) {}
            recorder = null;
        }
        if (!keepFile && outFile != null && outFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            outFile.delete();
        }
        outFile = null;
        peaks.clear();
        committed.setLength(0);
        partial = "";
    }
}
