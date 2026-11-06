Pod::Spec.new do |s|
  s.name = 'ConsciouslyJournalVoiceCapture'
  s.version = '0.0.1'
  s.summary = 'Single-engine journal voice capture'
  s.license = 'proprietary'
  s.homepage = 'https://consciously.live'
  s.author = 'Consciously'
  s.source = { :git => 'https://github.com/amaragak/consciously.live.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/JournalVoiceCapturePlugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
