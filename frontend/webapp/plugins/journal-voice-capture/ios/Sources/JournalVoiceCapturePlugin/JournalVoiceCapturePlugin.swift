import AVFoundation
import Capacitor
import Foundation
import Speech

/**
 * One AVAudioEngine input tap feeds:
 *  - SFSpeechAudioBufferRecognitionRequest (on-device)
 *  - AVAudioFile (AAC/m4a)
 *  - live audioLevel events
 * so recognition and recording never compete for the mic.
 */
@objc(JournalVoiceCapturePlugin)
public final class JournalVoiceCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "JournalVoiceCapturePlugin"
    public let jsName = "JournalVoiceCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribeFile", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private var audioFile: AVAudioFile?
    private var fileURL: URL?
    private var converter: AVAudioConverter?
    private var converterOutputFormat: AVAudioFormat?
    private var isRunning = false
    private var startedAt: Date?
    private var peaks: [Float] = []
    private var lastLevelEmit: CFTimeInterval = 0
    private var latestTranscript = ""
    private var finalTranscript = ""
    private var stopWorkItem: DispatchWorkItem?
    private let peakLock = NSLock()

    @objc func available(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("language") ?? Locale.current.identifier)
        let recognizer = SFSpeechRecognizer(locale: locale)
        var onDevice = false
        if #available(iOS 13.0, *) {
            onDevice = recognizer?.supportsOnDeviceRecognition == true
        }
        call.resolve([
            "available": recognizer?.isAvailable == true,
            "onDevice": onDevice,
        ])
    }

    /// Post-recording transcription from a saved clip (no live mic).
    @objc func transcribeFile(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing audio")
            return
        }
        let language = call.getString("language") ?? Locale.current.identifier
        let mime = call.getString("mimeType") ?? "audio/mp4"
        let locale = Locale(identifier: language)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            call.reject("Speech recognizer unavailable")
            return
        }
        if #available(iOS 13.0, *), !recognizer.supportsOnDeviceRecognition {
            call.reject("On-device recognition unavailable")
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard status == .authorized else {
                    call.reject("Speech recognition permission denied")
                    return
                }
                self?.runURLRecognition(
                    call: call,
                    recognizer: recognizer,
                    base64: base64,
                    mimeType: mime
                )
            }
        }
    }

    private func runURLRecognition(
        call: CAPPluginCall,
        recognizer: SFSpeechRecognizer,
        base64: String,
        mimeType: String
    ) {
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters), !data.isEmpty else {
            call.reject("Invalid audio data")
            return
        }
        let ext: String
        let lower = mimeType.lowercased()
        if lower.contains("wav") {
            ext = "wav"
        } else if lower.contains("caf") {
            ext = "caf"
        } else if lower.contains("aiff") || lower.contains("aif") {
            ext = "aiff"
        } else {
            ext = "m4a"
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("journal-transcribe-\(UUID().uuidString).\(ext)")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            call.reject("Could not write audio: \(error.localizedDescription)")
            return
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        if #available(iOS 13.0, *) {
            request.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }

        var finished = false
        let finish: (String?, String?) -> Void = { transcript, errorMessage in
            guard !finished else { return }
            finished = true
            try? FileManager.default.removeItem(at: url)
            if let errorMessage {
                call.reject(errorMessage)
                return
            }
            call.resolve([
                "transcript": transcript ?? "",
                "onDevice": true,
            ])
        }

        recognizer.recognitionTask(with: request) { result, error in
            if let error {
                // Prefer a final result if one already arrived.
                if let result, result.isFinal {
                    finish(result.bestTranscription.formattedString, nil)
                } else {
                    finish(nil, error.localizedDescription)
                }
                return
            }
            guard let result else { return }
            if result.isFinal {
                finish(result.bestTranscription.formattedString, nil)
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if isRunning {
            call.reject("Already recording")
            return
        }

        let language = call.getString("language") ?? Locale.current.identifier
        let locale = Locale(identifier: language)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            call.reject("Speech recognizer unavailable")
            return
        }
        if #available(iOS 13.0, *), !recognizer.supportsOnDeviceRecognition {
            call.reject("On-device recognition unavailable")
            return
        }
        speechRecognizer = recognizer

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                guard status == .authorized else {
                    call.reject("Speech recognition permission denied")
                    return
                }
                self.requestMicThenStart(call: call)
            }
        }
    }

    private func requestMicThenStart(call: CAPPluginCall) {
        let startIfGranted: (Bool) -> Void = { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                guard granted else {
                    call.reject("Microphone permission denied")
                    return
                }
                do {
                    try self.beginCapture()
                    call.resolve()
                } catch {
                    self.teardown(keepFile: false)
                    call.reject("Failed to start: \(error.localizedDescription)")
                }
            }
        }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in
                startIfGranted(granted)
            }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                startIfGranted(granted)
            }
        }
    }

    private func beginCapture() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .measurement,
            options: [.duckOthers, .allowBluetooth, .defaultToSpeaker]
        )
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let input = audioEngine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw NSError(
                domain: "JournalVoiceCapture",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid input format"]
            )
        }

        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("journal-voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: inputFormat.sampleRate,
            AVNumberOfChannelsKey: Int(min(2, inputFormat.channelCount)),
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            AVEncoderBitRateKey: 64_000,
        ]
        let file = try AVAudioFile(forWriting: outURL, settings: settings)
        let fileFormat = file.processingFormat
        audioFile = file
        fileURL = outURL
        converterOutputFormat = fileFormat
        if inputFormat != fileFormat {
            converter = AVAudioConverter(from: inputFormat, to: fileFormat)
        } else {
            converter = nil
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if #available(iOS 13.0, *) {
            request.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }
        recognitionRequest = request

        latestTranscript = ""
        finalTranscript = ""
        peaks = []
        startedAt = Date()

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            self?.handleTap(buffer: buffer)
        }

        recognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            DispatchQueue.main.async {
                if let result {
                    let text = result.bestTranscription.formattedString
                    self.latestTranscript = text
                    if result.isFinal {
                        self.finalTranscript = text
                    }
                    self.notifyListeners("partialResults", data: [
                        "matches": [text],
                        "isFinal": result.isFinal,
                    ])
                }
                if error != nil, self.finalTranscript.isEmpty {
                    self.finalTranscript = self.latestTranscript
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
        isRunning = true
    }

    private func handleTap(buffer: AVAudioPCMBuffer) {
        recognitionRequest?.append(buffer)
        emitLevel(from: buffer)
        write(buffer: buffer)
    }

    private func emitLevel(from buffer: AVAudioPCMBuffer) {
        let now = CACurrentMediaTime()
        guard now - lastLevelEmit >= 0.05 else { return }
        lastLevelEmit = now
        guard let channel = buffer.floatChannelData?[0] else { return }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return }
        var sum: Float = 0
        for i in 0..<frames {
            let s = channel[i]
            sum += s * s
        }
        let rms = sqrt(sum / Float(frames))
        let level = min(1, max(0, rms * 8))
        peakLock.lock()
        peaks.append(level)
        if peaks.count > 2400 {
            peaks.removeFirst(peaks.count - 2400)
        }
        peakLock.unlock()
        notifyListeners("audioLevel", data: ["level": Double(level)])
    }

    private func write(buffer: AVAudioPCMBuffer) {
        guard let file = audioFile else { return }
        do {
            if let converter, let outFormat = converterOutputFormat {
                let ratio = outFormat.sampleRate / buffer.format.sampleRate
                let outFrames = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
                guard let outBuffer = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: outFrames) else {
                    return
                }
                var error: NSError?
                var consumed = false
                let status = converter.convert(to: outBuffer, error: &error) { _, outStatus in
                    if consumed {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    consumed = true
                    outStatus.pointee = .haveData
                    return buffer
                }
                if status != .error, outBuffer.frameLength > 0 {
                    try file.write(from: outBuffer)
                }
            } else {
                try file.write(from: buffer)
            }
        } catch {
            // Keep recognising even if a write frame fails.
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard isRunning else {
            call.reject("Not recording")
            return
        }
        isRunning = false
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        recognitionRequest?.endAudio()

        let finish: () -> Void = { [weak self] in
            guard let self else { return }
            self.recognitionTask?.cancel()
            self.recognitionTask = nil
            self.recognitionRequest = nil
            // Close the file by releasing the writer.
            self.audioFile = nil
            self.converter = nil

            let duration = max(
                1,
                Int(ceil(Date().timeIntervalSince(self.startedAt ?? Date())))
            )
            self.peakLock.lock()
            let peakCopy = self.peaks
            self.peakLock.unlock()
            let transcript = self.finalTranscript.isEmpty ? self.latestTranscript : self.finalTranscript
            let path = self.fileURL?.path ?? ""
            let mime = "audio/mp4"

            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch { /* */ }

            self.speechRecognizer = nil
            self.startedAt = nil

            call.resolve([
                "path": path,
                "uri": path.isEmpty ? "" : "file://\(path)",
                "mimeType": mime,
                "durationSec": duration,
                "peaks": peakCopy.map { Double($0) },
                "transcript": transcript,
            ])
        }

        // Give SFSpeech a brief moment to emit a final result.
        let work = DispatchWorkItem(block: finish)
        stopWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45, execute: work)
    }

    private func teardown(keepFile: Bool) {
        isRunning = false
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        audioFile = nil
        converter = nil
        speechRecognizer = nil
        if !keepFile, let url = fileURL {
            try? FileManager.default.removeItem(at: url)
        }
        fileURL = nil
        startedAt = nil
        peaks = []
        latestTranscript = ""
        finalTranscript = ""
    }
}
