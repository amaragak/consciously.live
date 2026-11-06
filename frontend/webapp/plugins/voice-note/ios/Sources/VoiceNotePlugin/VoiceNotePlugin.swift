import AVFoundation
import Capacitor
import Foundation
import Speech

/**
 * One AVAudioEngine input tap feeds:
 *  - AVAudioFile (AAC/m4a) in Documents
 *  - SFSpeechAudioBufferRecognitionRequest (on-device)
 *  - level events (~20/s)
 * Restart recognition on silence gaps; keep a committed transcript.
 */
@objc(VoiceNotePlugin)
public final class VoiceNotePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoiceNotePlugin"
    public let jsName = "VoiceNote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isOnDeviceAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
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
    private var levels: [Float] = []
    private var lastLevelEmit: CFTimeInterval = 0
    private var committedTranscript = ""
    private var segmentHypothesis = ""
    private var speechReason: String?
    private var languageTag = Locale.current.identifier
    private var restartWorkItem: DispatchWorkItem?
    private let levelLock = NSLock()
    private var interruptionObserver: NSObjectProtocol?

    @objc func isOnDeviceAvailable(_ call: CAPPluginCall) {
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

    @objc func start(_ call: CAPPluginCall) {
        if isRunning {
            call.reject("Already recording")
            return
        }
        languageTag = call.getString("language") ?? Locale.current.identifier
        speechReason = nil
        committedTranscript = ""
        segmentHypothesis = ""
        levels = []

        let locale = Locale(identifier: languageTag)
        speechRecognizer = SFSpeechRecognizer(locale: locale)

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                if status != .authorized {
                    self.speechReason = "speech-permission-denied"
                } else if let r = self.speechRecognizer, #available(iOS 13.0, *), !r.supportsOnDeviceRecognition {
                    self.speechReason = "on-device-unavailable"
                } else if self.speechRecognizer?.isAvailable != true {
                    self.speechReason = "speech-unavailable"
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
                    self.teardown(deleteFile: true)
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
            mode: .default,
            options: [.duckOthers, .allowBluetooth, .defaultToSpeaker]
        )
        // Keep recording with screen locked; interruption pauses via notification.
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        installInterruptionObserver()

        let input = audioEngine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw NSError(
                domain: "VoiceNote",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid input format"]
            )
        }

        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let outURL = docs.appendingPathComponent("voice-note-\(UUID().uuidString).m4a")
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
        converter = inputFormat != fileFormat
            ? AVAudioConverter(from: inputFormat, to: fileFormat)
            : nil

        startedAt = Date()
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            self?.handleTap(buffer: buffer)
        }

        if speechReason == nil {
            startRecognitionTask()
        }

        audioEngine.prepare()
        try audioEngine.start()
        isRunning = true
    }

    private func startRecognitionTask() {
        guard speechReason == nil, let recognizer = speechRecognizer else { return }
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if #available(iOS 13.0, *) {
            request.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }
        recognitionRequest = request
        segmentHypothesis = ""

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            DispatchQueue.main.async {
                if let result {
                    let text = result.bestTranscription.formattedString
                    self.segmentHypothesis = text
                    self.emitPartial()
                    if result.isFinal {
                        self.commitSegment()
                    }
                }
                if error != nil || result?.isFinal == true {
                    // Long pause / end — restart on the same tap if still recording.
                    if self.isRunning, self.speechReason == nil {
                        self.scheduleRecognitionRestart()
                    }
                }
            }
        }
    }

    private func scheduleRecognitionRestart() {
        restartWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.isRunning, self.speechReason == nil else { return }
            self.commitSegment()
            self.startRecognitionTask()
        }
        restartWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }

    private func commitSegment() {
        let piece = segmentHypothesis.trimmingCharacters(in: .whitespacesAndNewlines)
        segmentHypothesis = ""
        guard !piece.isEmpty else { return }
        if committedTranscript.isEmpty {
            committedTranscript = piece
        } else if !committedTranscript.hasSuffix(piece) {
            // Avoid obvious repeats when the engine restarts with overlap.
            if piece.hasPrefix(committedTranscript) {
                committedTranscript = piece
            } else if committedTranscript.hasPrefix(piece) {
                /* keep committed */
            } else {
                committedTranscript = "\(committedTranscript) \(piece)"
            }
        }
        emitPartial()
    }

    private func emitPartial() {
        let live = [committedTranscript, segmentHypothesis]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        notifyListeners("partial", data: ["text": live])
    }

    private func handleTap(buffer: AVAudioPCMBuffer) {
        recognitionRequest?.append(buffer)
        emitLevel(from: buffer)
        write(buffer: buffer)
    }

    private func emitLevel(from buffer: AVAudioPCMBuffer) {
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
        levelLock.lock()
        levels.append(level)
        if levels.count > 12_000 {
            levels.removeFirst(levels.count - 12_000)
        }
        levelLock.unlock()
        let now = CACurrentMediaTime()
        guard now - lastLevelEmit >= 0.05 else { return }
        lastLevelEmit = now
        notifyListeners("level", data: ["level": Double(level)])
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
            /* keep recognising even if a write frame fails */
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard isRunning else {
            call.reject("Not recording")
            return
        }
        isRunning = false
        restartWorkItem?.cancel()
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        recognitionRequest?.endAudio()

        let finish: () -> Void = { [weak self] in
            guard let self else { return }
            self.commitSegment()
            self.recognitionTask?.cancel()
            self.recognitionTask = nil
            self.recognitionRequest = nil
            self.audioFile = nil
            self.converter = nil
            self.removeInterruptionObserver()

            let durationMs = max(
                1,
                Int((Date().timeIntervalSince(self.startedAt ?? Date())) * 1000)
            )
            self.levelLock.lock()
            let wave = downsample(self.levels, count: 60)
            self.levelLock.unlock()

            let path = self.fileURL?.path ?? ""
            var payload: [String: Any] = [
                "filePath": path,
                "durationMs": durationMs,
                "transcript": self.committedTranscript,
                "waveform": wave.map { Double($0) },
            ]
            if let reason = self.speechReason {
                payload["reason"] = reason
            }

            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch { /* */ }

            self.speechRecognizer = nil
            self.startedAt = nil
            call.resolve(payload)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: finish)
    }

    @objc func cancel(_ call: CAPPluginCall) {
        teardown(deleteFile: true)
        call.resolve()
    }

    private func teardown(deleteFile: Bool) {
        isRunning = false
        restartWorkItem?.cancel()
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
        removeInterruptionObserver()
        if deleteFile, let url = fileURL {
            try? FileManager.default.removeItem(at: url)
        }
        fileURL = nil
        startedAt = nil
        levels = []
        committedTranscript = ""
        segmentHypothesis = ""
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch { /* */ }
    }

    private func installInterruptionObserver() {
        removeInterruptionObserver()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let self else { return }
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            if type == AVAudioSession.InterruptionType.began.rawValue {
                if self.audioEngine.isRunning {
                    self.audioEngine.pause()
                }
            } else if type == AVAudioSession.InterruptionType.ended.rawValue {
                guard self.isRunning else { return }
                do {
                    try AVAudioSession.sharedInstance().setActive(true)
                    try self.audioEngine.start()
                } catch { /* */ }
            }
        }
    }

    private func removeInterruptionObserver() {
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
            interruptionObserver = nil
        }
    }
}

private func downsample(_ levels: [Float], count: Int) -> [Float] {
    if levels.isEmpty {
        return Array(repeating: 0.12, count: count)
    }
    if levels.count <= count { return levels }
    var out: [Float] = []
    let step = Double(levels.count) / Double(count)
    for i in 0..<count {
        let start = Int(Double(i) * step)
        let end = Int(Double(i + 1) * step)
        var peak: Float = 0
        for j in start..<max(start + 1, end) {
            if j < levels.count {
                peak = max(peak, levels[j])
            }
        }
        out.append(peak)
    }
    return out
}
