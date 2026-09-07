// This module runs inside Electron's main process. Keeping AppKit and Speech in
// that process makes both local keyboard events and privacy prompts belong to
// Sherlock. No audio is written to disk or sent to a network speech service.
#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>
#import <os/lock.h>
#include <node_api.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <memory>
#include <string>

static double Now() {
  return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

struct VoiceEvent {
  std::string type, requestID, state, text, code, message;
  double level = 0;
};

static void SetString(napi_env env, napi_value object, const char *key, const std::string &value) {
  napi_value string;
  if (napi_create_string_utf8(env, value.data(), value.size(), &string) == napi_ok)
    napi_set_named_property(env, object, key, string);
}

static void DeliverEvent(napi_env env, napi_value callback, void *, void *data) {
  std::unique_ptr<VoiceEvent> event(static_cast<VoiceEvent *>(data));
  if (!env || !callback) return;
  napi_value object, receiver, ignored;
  if (napi_create_object(env, &object) != napi_ok) return;
  SetString(env, object, "type", event->type);
  if (!event->requestID.empty()) SetString(env, object, "requestId", event->requestID);
  if (event->type == "state") SetString(env, object, "state", event->state);
  if (event->type == "partial" || event->type == "final") SetString(env, object, "text", event->text);
  if (event->type == "error") {
    SetString(env, object, "code", event->code);
    SetString(env, object, "message", event->message);
  }
  if (event->type == "level") {
    napi_value level;
    if (napi_create_double(env, event->level, &level) == napi_ok)
      napi_set_named_property(env, object, "level", level);
  }
  napi_get_undefined(env, &receiver);
  napi_call_function(env, receiver, callback, 1, &object, &ignored);
}

@interface SVVoiceSession : NSObject {
@public
  os_unfair_lock audioLock;
  BOOL acceptsAudio;
  std::atomic<double> peakRMS;
  std::atomic<double> lastSoundTime;
  std::atomic<bool> heardAudio;
  std::atomic<bool> audioFailed;
  double soundRunSeconds;
}
@property(nonatomic, copy) NSString *requestID;
@property(nonatomic, copy) NSString *locale;
@property(nonatomic, copy) NSString *transcript;
@property(nonatomic, copy) NSString *state;
@property(nonatomic) BOOL finished;
@property(nonatomic) BOOL tapInstalled;
@property(nonatomic) BOOL audioEnded;
@property(nonatomic) BOOL heardSpeech;
@property(nonatomic) double startedAt;
@property(nonatomic) double lastSpeechAt;
@property(nonatomic) double stoppedAt;
@property(nonatomic, strong) AVAudioEngine *engine;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, strong) dispatch_source_t timer;
@end

@implementation SVVoiceSession
- (instancetype)init {
  if ((self = [super init])) {
    audioLock = OS_UNFAIR_LOCK_INIT;
    acceptsAudio = NO;
    peakRMS.store(0);
    lastSoundTime.store(0);
    heardAudio.store(false);
    audioFailed.store(false);
    soundRunSeconds = 0;
    _transcript = @"";
    _state = @"authorizing";
  }
  return self;
}
@end

@interface SVVoiceController : NSObject
@property(nonatomic) napi_threadsafe_function callback;
@property(nonatomic) BOOL enabled;
@property(nonatomic) BOOL disposed;
@property(nonatomic, strong) id monitor;
@property(nonatomic, strong) id blurObserver;
@property(nonatomic, strong) SVVoiceSession *session;
@property(nonatomic) BOOL fnDown;
@property(nonatomic) BOOL fnChord;
@property(nonatomic) BOOL fnHolding;
@property(nonatomic) NSUInteger fnGeneration;
@property(nonatomic) double fnPressedAt;
@property(nonatomic) double fnLastTapAt;
- (void)installMonitor;
- (void)dispose;
- (void)resetFn;
- (void)activateHold:(NSUInteger)generation;
- (BOOL)handleFn:(BOOL)down modifiers:(BOOL)modifiers keyDown:(BOOL)keyDown time:(double)time active:(BOOL)active;
- (void)emit:(VoiceEvent)event;
- (void)start:(NSString *)requestID locale:(NSString *)locale;
- (void)stop:(NSString *)requestID;
- (void)cancel:(NSString *)requestID;
- (void)beginListening:(SVVoiceSession *)session;
- (void)result:(SVVoiceSession *)session text:(NSString *)text final:(BOOL)final failed:(BOOL)failed;
- (void)tick:(SVVoiceSession *)session now:(double)now;
@end

@implementation SVVoiceController

- (void)emit:(VoiceEvent)event {
  if (_disposed || !_callback) return;
  auto value = std::make_unique<VoiceEvent>(std::move(event));
  if (napi_call_threadsafe_function(_callback, value.get(), napi_tsfn_nonblocking) == napi_ok) value.release();
}

- (void)state:(NSString *)state session:(SVVoiceSession *)session {
  session.state = state;
  VoiceEvent event;
  event.type = "state"; event.requestID = session.requestID.UTF8String; event.state = state.UTF8String;
  [self emit:std::move(event)];
}

- (BOOL)current:(SVVoiceSession *)session {
  return !_disposed && session && _session == session && !session.finished;
}

- (void)error:(NSString *)code message:(NSString *)message session:(SVVoiceSession *)session {
  if (![self current:session]) return;
  VoiceEvent event;
  event.type = "error"; event.requestID = session.requestID.UTF8String;
  event.code = code.UTF8String; event.message = message.UTF8String;
  [self finish:session];
  [self emit:std::move(event)];
}

- (void)stopAudio:(SVVoiceSession *)session {
  // Audio callbacks only try this lock. The main thread can briefly wait for an
  // append, but the real-time callback never waits for main-thread cleanup.
  os_unfair_lock_lock(&session->audioLock);
  session->acceptsAudio = NO;
  os_unfair_lock_unlock(&session->audioLock);
  @try {
    [session.engine stop];
    if (session.tapInstalled) {
      session.tapInstalled = NO;
      [session.engine.inputNode removeTapOnBus:0];
    }
  } @catch (__unused NSException *exception) {
    session.tapInstalled = NO;
  }
}

- (void)finish:(SVVoiceSession *)session {
  if (session.finished) return;
  session.finished = YES;
  if (_session == session) _session = nil;
  [self stopAudio:session];
  if (session.timer) { dispatch_source_cancel(session.timer); session.timer = nil; }
  if (!session.audioEnded) { session.audioEnded = YES; [session.request endAudio]; }
  [session.task cancel];
  session.task = nil;
  session.request = nil;
  session.engine = nil;
  session.recognizer = nil;
}

- (void)finishText:(SVVoiceSession *)session {
  if (![self current:session]) return;
  NSString *text = [session.transcript stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (!text.length) {
    [self error:@"no_speech" message:@"没有识别到语音，请重试。" session:session];
    return;
  }
  VoiceEvent event;
  event.type = "final"; event.requestID = session.requestID.UTF8String; event.text = text.UTF8String;
  [self finish:session];
  [self emit:std::move(event)];
}

- (void)start:(NSString *)requestID locale:(NSString *)locale {
  if (_session) [self cancel:_session.requestID];
  SVVoiceSession *session = [SVVoiceSession new];
  session.requestID = requestID; session.locale = locale;
  _session = session;
  [self state:@"authorizing" session:session];
#if SHERLOCK_VOICE_TESTING
  // The test artifact never requests privacy permissions or opens audio.
  return;
#else
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  if (![info[@"NSMicrophoneUsageDescription"] isKindOfClass:NSString.class] ||
      ![info[@"NSMicrophoneUsageDescription"] length] ||
      ![info[@"NSSpeechRecognitionUsageDescription"] isKindOfClass:NSString.class] ||
      ![info[@"NSSpeechRecognitionUsageDescription"] length]) {
    [self error:@"configuration_error" message:@"此测试包缺少语音权限说明，请重新构建 Sherlock。" session:session];
    return;
  }
  __weak SVVoiceController *weakSelf = self;
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
  if (status == AVAuthorizationStatusAuthorized) {
    [self authorizeSpeech:session];
  } else if (status == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        SVVoiceController *owner = weakSelf;
        if (![owner current:session]) return;
        if (granted) [owner authorizeSpeech:session];
        else [owner error:@"microphone_denied" message:@"请在系统设置中允许 Sherlock 使用麦克风。" session:session];
      });
    }];
  } else {
    [self error:@"microphone_denied" message:@"请在系统设置中允许 Sherlock 使用麦克风。" session:session];
  }
#endif
}

- (void)authorizeSpeech:(SVVoiceSession *)session {
  if (![self current:session]) return;
  SFSpeechRecognizerAuthorizationStatus status = SFSpeechRecognizer.authorizationStatus;
  if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) {
    [self beginListening:session];
  } else if (status == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
    __weak SVVoiceController *weakSelf = self;
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus authorization) {
      dispatch_async(dispatch_get_main_queue(), ^{
        SVVoiceController *owner = weakSelf;
        if (![owner current:session]) return;
        if (authorization == SFSpeechRecognizerAuthorizationStatusAuthorized) [owner beginListening:session];
        else [owner error:@"speech_denied" message:@"请在系统设置中允许 Sherlock 使用语音识别。" session:session];
      });
    }];
  } else {
    [self error:@"speech_denied" message:@"请在系统设置中允许 Sherlock 使用语音识别。" session:session];
  }
}

- (void)beginListening:(SVVoiceSession *)session {
  if (![self current:session] || ![session.state isEqualToString:@"authorizing"]) return;
  session.startedAt = Now();
  session.lastSpeechAt = session.startedAt;
  session->lastSoundTime.store(session.startedAt);
#if SHERLOCK_VOICE_TESTING
  [self state:@"listening" session:session];
  return;
#else
  @try {
    session.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:session.locale]];
    if (!session.recognizer || !session.recognizer.supportsOnDeviceRecognition) {
      [self error:@"on_device_unavailable" message:@"当前设备尚不支持该语言的本地语音识别。" session:session];
      return;
    }
    if (!session.recognizer.available) {
      [self error:@"recognizer_unavailable" message:@"本地语音识别暂时不可用，请稍后重试。" session:session];
      return;
    }
    session.recognizer.queue = NSOperationQueue.mainQueue;
    session.request = [SFSpeechAudioBufferRecognitionRequest new];
    session.request.requiresOnDeviceRecognition = YES;
    session.request.shouldReportPartialResults = YES;
    session.request.taskHint = SFSpeechRecognitionTaskHintDictation;
    if (@available(macOS 13.0, *)) session.request.addsPunctuation = YES;
    session.engine = [AVAudioEngine new];
    AVAudioInputNode *input = session.engine.inputNode;
    AVAudioFormat *format = [input outputFormatForBus:0];
    if (format.sampleRate <= 0 || format.channelCount == 0) {
      [self error:@"microphone_unavailable" message:@"没有可用的麦克风，请检查声音输入设备。" session:session];
      return;
    }
    __weak SVVoiceController *weakSelf = self;
    __weak SVVoiceSession *weakSession = session;
    session.task = [session.recognizer recognitionTaskWithRequest:session.request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
      // Speech normally uses the configured queue, but explicitly serialize all
      // state changes with cancellation and the main-process keyboard monitor.
      dispatch_async(dispatch_get_main_queue(), ^{
        SVVoiceController *owner = weakSelf;
        SVVoiceSession *current = weakSession;
        [owner result:current text:result.bestTranscription.formattedString final:result.isFinal failed:error != nil];
      });
    }];
    session->acceptsAudio = YES;
    [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buffer, __unused AVAudioTime *time) {
      SVVoiceSession *current = weakSession;
      if (!current || !os_unfair_lock_trylock(&current->audioLock)) return;
      if (!current->acceptsAudio) { os_unfair_lock_unlock(&current->audioLock); return; }
      @try {
      [current.request appendAudioPCMBuffer:buffer];
      double squares = 0;
      const AVAudioFrameCount frames = buffer.frameLength;
      const AVAudioChannelCount channels = buffer.format.channelCount;
      if (buffer.floatChannelData && frames && channels) {
        const BOOL interleaved = buffer.format.interleaved;
        for (AVAudioChannelCount channel = 0; channel < channels; channel++) {
          const float *values = buffer.floatChannelData[interleaved ? 0 : channel];
          for (AVAudioFrameCount frame = 0; frame < frames; frame++) {
            const double value = values[interleaved ? frame * channels + channel : frame];
            squares += value * value;
          }
        }
        const double rms = std::sqrt(squares / (static_cast<double>(frames) * channels));
        double prior = current->peakRMS.load();
        while (rms > prior && !current->peakRMS.compare_exchange_weak(prior, rms)) {}
        if (rms >= 0.009) {
          current->soundRunSeconds += frames / buffer.format.sampleRate;
          if (current->soundRunSeconds >= 0.12) {
            current->heardAudio.store(true);
            current->lastSoundTime.store(Now());
          }
        } else current->soundRunSeconds = 0;
      }
      } @catch (__unused NSException *exception) {
        current->acceptsAudio = NO;
        current->audioFailed.store(true);
      }
      os_unfair_lock_unlock(&current->audioLock);
    }];
    session.tapInstalled = YES;
    [session.engine prepare];
    NSError *error = nil;
    if (![session.engine startAndReturnError:&error]) {
      [self error:@"microphone_unavailable" message:@"无法启动麦克风，请检查声音输入设备后重试。" session:session];
      return;
    }
    [self state:@"listening" session:session];
    session.timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(session.timer, dispatch_time(DISPATCH_TIME_NOW, 0), NSEC_PER_SEC / 30, NSEC_PER_MSEC * 5);
    dispatch_source_set_event_handler(session.timer, ^{
      [weakSelf tick:weakSession now:Now()];
    });
    dispatch_resume(session.timer);
  } @catch (__unused NSException *exception) {
    [self error:@"audio_error" message:@"语音输入启动失败，请检查麦克风后重试。" session:session];
  }
#endif
}

- (void)result:(SVVoiceSession *)session text:(NSString *)text final:(BOOL)final failed:(BOOL)failed {
  if (![self current:session] || [session.state isEqualToString:@"authorizing"]) return;
  if (text && ![text isEqualToString:session.transcript]) {
    session.transcript = text;
    if ([text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length) {
      session.heardSpeech = YES;
      session.lastSpeechAt = Now();
    }
    if (!final) {
      VoiceEvent event;
      event.type = "partial"; event.requestID = session.requestID.UTF8String; event.text = text.UTF8String;
      [self emit:std::move(event)];
    }
  }
  if (final) [self finishText:session];
  else if (failed) {
    if ([session.state isEqualToString:@"transcribing"] && session.transcript.length) [self finishText:session];
    else [self error:@"speech_error" message:@"语音识别中断，请重试。" session:session];
  }
}

- (void)stop:(NSString *)requestID {
  SVVoiceSession *session = _session;
  if (![self current:session] || ![session.requestID isEqualToString:requestID]) return;
  if ([session.state isEqualToString:@"authorizing"]) { [self cancel:requestID]; return; }
  if (![session.state isEqualToString:@"listening"]) return;
  session.stoppedAt = Now();
  [self state:@"transcribing" session:session];
  [self stopAudio:session];
  if (!session.audioEnded) { session.audioEnded = YES; [session.request endAudio]; }
}

- (void)tick:(SVVoiceSession *)session now:(double)now {
  if (![self current:session]) return;
  if ([session.state isEqualToString:@"transcribing"]) {
    // A final callback is not guaranteed after endAudio (e.g. a recognizer
    // service interruption). Retain the last complete partial after a bound.
    if (now - session.stoppedAt >= 5) [self finishText:session];
    return;
  }
  if (![session.state isEqualToString:@"listening"]) return;
  if (session->audioFailed.load()) {
    [self error:@"audio_error" message:@"语音输入中断，请检查麦克风后重试。" session:session];
    return;
  }
  VoiceEvent event;
  event.type = "level"; event.requestID = session.requestID.UTF8String;
  event.level = std::clamp(std::sqrt(std::max(0.0, session->peakRMS.exchange(0))) * 2, 0.0, 1.0);
  [self emit:std::move(event)];
  const double elapsed = now - session.startedAt;
  const BOOL heardSpeech = session.heardSpeech || session->heardAudio.load();
  if (!heardSpeech && elapsed >= 10) {
    [self error:@"no_speech" message:@"没有识别到语音，请重试。" session:session];
  } else if (elapsed >= 90) {
    [self stop:session.requestID];
  }
}

- (void)cancel:(NSString *)requestID {
  SVVoiceSession *session = _session;
  if (![self current:session] || ![session.requestID isEqualToString:requestID]) return;
  VoiceEvent event;
  event.type = "cancelled"; event.requestID = session.requestID.UTF8String;
  [self finish:session];
  [self emit:std::move(event)];
}

- (void)setEnabled:(BOOL)enabled {
  _enabled = enabled;
  if (!enabled) {
    [self resetFn];
  }
}

- (void)resetFn {
  _fnGeneration++; _fnHolding = NO; _fnDown = NO; _fnChord = NO; _fnPressedAt = 0; _fnLastTapAt = 0;
}

- (void)activateHold:(NSUInteger)generation {
  if (_disposed || !_enabled || !_fnDown || _fnChord || _fnHolding || _fnGeneration != generation || _session) return;
  _fnHolding = YES; _fnLastTapAt = 0;
  VoiceEvent event; event.type = "hold-start"; [self emit:std::move(event)];
}

- (BOOL)handleFn:(BOOL)down modifiers:(BOOL)modifiers keyDown:(BOOL)keyDown time:(double)time active:(BOOL)active {
  if (_disposed || !_enabled || !active) { [self resetFn]; return NO; }
  // A Fn release can arrive with Shift/Command/etc. still held. Clear the
  // chord before the modifier early return so it cannot poison the next tap.
  // Non-Fn modifier events pass the existing fnDown value from the monitor,
  // so they cannot enter this release branch while Fn remains held.
  if (!keyDown && !down && _fnDown && modifiers) { [self resetFn]; return NO; }
  if (keyDown || modifiers) {
    if (_fnDown || down) _fnChord = YES;
    _fnLastTapAt = 0;
    return NO;
  }
  if (down) {
    if (!_fnDown) {
      _fnDown = YES; _fnChord = NO; _fnPressedAt = time;
      const NSUInteger generation = ++_fnGeneration;
      __weak SVVoiceController *weakSelf = self;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 350 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        SVVoiceController *owner = weakSelf;
        [owner activateHold:generation];
      });
    }
    if (time - _fnPressedAt >= 0.35) [self activateHold:_fnGeneration];
    // Consume only isolated Fn flag events in the active research window.
    // Fn+key still arrives with its modifier bits and is never swallowed.
    return YES;
  }
  if (!_fnDown) return NO;
  _fnDown = NO; _fnGeneration++;
  if (_fnHolding) {
    _fnHolding = NO; _fnLastTapAt = 0;
    VoiceEvent event; event.type = "finish"; [self emit:std::move(event)];
    return YES;
  }
  if (_session && !_fnChord) {
    _fnLastTapAt = 0;
    VoiceEvent event; event.type = "finish"; [self emit:std::move(event)];
    return YES;
  }
  const BOOL valid = !_fnChord && time >= _fnPressedAt && time - _fnPressedAt <= 0.5;
  _fnChord = NO;
  if (!valid) { _fnLastTapAt = 0; return NO; }
  if (_fnLastTapAt > 0 && time > _fnLastTapAt && time - _fnLastTapAt <= 0.5) {
    _fnLastTapAt = 0;
    VoiceEvent event; event.type = "toggle"; [self emit:std::move(event)];
  } else _fnLastTapAt = time;
  return YES;
}

- (void)installMonitor {
  // A standalone Node smoke test has no NSApplication and needs no monitor.
  if (!NSApp) return;
  __weak SVVoiceController *weakSelf = self;
  _monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged | NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
    SVVoiceController *owner = weakSelf;
    if (!owner) return event;
    BOOL active = NSApp.active && NSApp.keyWindow != nil;
    const NSUInteger modifiers = event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl | NSEventModifierFlagOption | NSEventModifierFlagShift);
    if (event.type == NSEventTypeKeyDown) {
      [owner handleFn:(event.modifierFlags & NSEventModifierFlagFunction) != 0 modifiers:modifiers != 0 keyDown:YES time:event.timestamp active:active];
      return event;
    }
    if (event.keyCode != 0x3F) {
      if (modifiers) [owner handleFn:owner.fnDown modifiers:YES keyDown:NO time:event.timestamp active:active];
      return event;
    }
    const BOOL consumed = [owner handleFn:(event.modifierFlags & NSEventModifierFlagFunction) != 0 modifiers:modifiers != 0 keyDown:NO time:event.timestamp active:active];
    return consumed ? nil : event;
  }];
  _blurObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSApplicationDidResignActiveNotification object:NSApp queue:NSOperationQueue.mainQueue usingBlock:^(__unused NSNotification *notification) {
    [weakSelf resetFn];
  }];
}

- (void)dispose {
  if (_disposed) return;
  _disposed = YES;
  _enabled = NO;
  [self resetFn];
  if (_session) [self finish:_session];
  if (_monitor) { [NSEvent removeMonitor:_monitor]; _monitor = nil; }
  if (_blurObserver) { [NSNotificationCenter.defaultCenter removeObserver:_blurObserver]; _blurObserver = nil; }
  if (_callback) {
    napi_release_threadsafe_function(_callback, napi_tsfn_abort);
    _callback = nullptr;
  }
}
@end

struct AddonState { __strong SVVoiceController *controller = nil; };

static napi_value Undefined(napi_env env) {
  napi_value value; napi_get_undefined(env, &value); return value;
}

static AddonState *State(napi_env env, bool initialized = true) {
  if (![NSThread isMainThread]) {
    napi_throw_error(env, nullptr, "Research voice must run in the Electron main process."); return nullptr;
  }
  AddonState *state = nullptr;
  napi_get_instance_data(env, reinterpret_cast<void **>(&state));
  if (!state || (initialized && (!state->controller || state->controller.disposed))) {
    napi_throw_error(env, nullptr, "Research voice init(callback) is required."); return nullptr;
  }
  return state;
}

static bool Arguments(napi_env env, napi_callback_info info, size_t count, napi_value *values) {
  size_t actual = count;
  if (napi_get_cb_info(env, info, &actual, values, nullptr, nullptr) != napi_ok || actual != count) {
    napi_throw_type_error(env, nullptr, "Invalid research voice arguments."); return false;
  }
  return true;
}

static NSString *StringArgument(napi_env env, napi_value value, const char *name, size_t maximum) {
  napi_valuetype type; size_t length = 0;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string ||
      napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok || length == 0 || length > maximum) {
    std::string message = std::string(name) + " must be a non-empty string of at most " + std::to_string(maximum) + " bytes.";
    napi_throw_type_error(env, nullptr, message.c_str()); return nil;
  }
  std::string text(length + 1, '\0');
  napi_get_value_string_utf8(env, value, text.data(), text.size(), &length);
  NSString *result = [[NSString alloc] initWithBytes:text.data() length:length encoding:NSUTF8StringEncoding];
  if (!result || [result rangeOfString:@"\0"].location != NSNotFound ||
      ![result stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length) {
    std::string message = std::string(name) + " is invalid.";
    napi_throw_type_error(env, nullptr, message.c_str()); return nil;
  }
  return result;
}

static bool BooleanArgument(napi_env env, napi_value value, bool *result) {
  if (napi_get_value_bool(env, value, result) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Expected a boolean."); return false;
  }
  return true;
}

static napi_value Init(napi_env env, napi_callback_info info) {
  napi_value values[1];
  if (!Arguments(env, info, 1, values)) return nullptr;
  napi_valuetype type;
  napi_typeof(env, values[0], &type);
  if (type != napi_function) { napi_throw_type_error(env, nullptr, "init requires a callback function."); return nullptr; }
  AddonState *state = State(env, false);
  if (!state) return nullptr;
  [state->controller dispose];
  SVVoiceController *controller = [SVVoiceController new];
  napi_value name; napi_create_string_utf8(env, "SherlockResearchVoice", NAPI_AUTO_LENGTH, &name);
  napi_threadsafe_function callback = nullptr;
  if (napi_create_threadsafe_function(env, values[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, DeliverEvent, &callback) != napi_ok) {
    napi_throw_error(env, nullptr, "Could not initialize research voice events."); return nullptr;
  }
  napi_unref_threadsafe_function(env, callback);
  controller.callback = callback;
  state->controller = controller;
  [controller installMonitor];
  return Undefined(env);
}

static napi_value SetEnabled(napi_env env, napi_callback_info info) {
  napi_value values[1]; bool enabled;
  if (!Arguments(env, info, 1, values) || !BooleanArgument(env, values[0], &enabled)) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  state->controller.enabled = enabled;
  return Undefined(env);
}

static napi_value Start(napi_env env, napi_callback_info info) {
  napi_value values[2];
  if (!Arguments(env, info, 2, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  NSString *locale = StringArgument(env, values[1], "locale", 64); if (!locale) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  [state->controller start:requestID locale:locale];
  return Undefined(env);
}

static napi_value Stop(napi_env env, napi_callback_info info) {
  napi_value values[1]; if (!Arguments(env, info, 1, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  [state->controller stop:requestID]; return Undefined(env);
}

static napi_value Cancel(napi_env env, napi_callback_info info) {
  napi_value values[1]; if (!Arguments(env, info, 1, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  [state->controller cancel:requestID]; return Undefined(env);
}

static napi_value Dispose(napi_env env, napi_callback_info) {
  AddonState *state = State(env, false); if (!state) return nullptr;
  [state->controller dispose]; state->controller = nil;
  return Undefined(env);
}

#if SHERLOCK_VOICE_TESTING
// These hooks exist only in the disposable test binary. They exercise the same
// cancellation, finalization, VAD and Fn state transitions without TCC or audio.
static napi_value TestAuthorize(napi_env env, napi_callback_info info) {
  napi_value values[1]; if (!Arguments(env, info, 1, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  SVVoiceSession *session = state->controller.session;
  if ([session.requestID isEqualToString:requestID]) [state->controller beginListening:session];
  return Undefined(env);
}

static napi_value TestResult(napi_env env, napi_callback_info info) {
  napi_value values[4]; if (!Arguments(env, info, 4, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  size_t length = 0; napi_get_value_string_utf8(env, values[1], nullptr, 0, &length);
  std::string text(length + 1, '\0'); napi_get_value_string_utf8(env, values[1], text.data(), text.size(), &length);
  NSString *transcript = [[NSString alloc] initWithBytes:text.data() length:length encoding:NSUTF8StringEncoding];
  bool final, failed;
  if (!BooleanArgument(env, values[2], &final) || !BooleanArgument(env, values[3], &failed)) return nullptr;
  AddonState *state = State(env); if (!state) return nullptr;
  SVVoiceSession *session = state->controller.session;
  if ([session.requestID isEqualToString:requestID]) [state->controller result:session text:transcript final:final failed:failed];
  return Undefined(env);
}

static napi_value TestTick(napi_env env, napi_callback_info info) {
  napi_value values[5]; if (!Arguments(env, info, 5, values)) return nullptr;
  NSString *requestID = StringArgument(env, values[0], "requestId", 256); if (!requestID) return nullptr;
  double elapsed = 0, silence = 0, rms = 0; bool heard;
  napi_get_value_double(env, values[1], &elapsed); napi_get_value_double(env, values[2], &silence);
  if (!BooleanArgument(env, values[3], &heard)) return nullptr;
  napi_get_value_double(env, values[4], &rms);
  AddonState *state = State(env); if (!state) return nullptr;
  SVVoiceSession *session = state->controller.session;
  if ([session.requestID isEqualToString:requestID]) {
    const double now = session.startedAt + elapsed;
    session.heardSpeech = heard;
    session.lastSpeechAt = now - silence;
    session->lastSoundTime.store(now - silence);
    session->peakRMS.store(rms);
    [state->controller tick:session now:now];
    if ([session.state isEqualToString:@"transcribing"] && session.stoppedAt < session.startedAt + elapsed)
      session.stoppedAt = now;
  }
  return Undefined(env);
}

static napi_value TestFn(napi_env env, napi_callback_info info) {
  napi_value values[5]; if (!Arguments(env, info, 5, values)) return nullptr;
  bool down, modifiers, keyDown, active; double time = 0;
  if (!BooleanArgument(env, values[0], &down) || !BooleanArgument(env, values[1], &modifiers) ||
      !BooleanArgument(env, values[2], &keyDown) || !BooleanArgument(env, values[4], &active)) return nullptr;
  napi_get_value_double(env, values[3], &time);
  AddonState *state = State(env); if (!state) return nullptr;
  napi_value consumed;
  napi_get_boolean(env, [state->controller handleFn:down modifiers:modifiers keyDown:keyDown time:time active:active], &consumed);
  return consumed;
}
#endif

static void Cleanup(void *data) {
  AddonState *state = static_cast<AddonState *>(data);
  [state->controller dispose];
  delete state;
}

static napi_value Register(napi_env env, napi_value exports) {
  auto state = std::make_unique<AddonState>();
  if (napi_set_instance_data(env, state.get(), nullptr, nullptr) != napi_ok ||
      napi_add_env_cleanup_hook(env, Cleanup, state.get()) != napi_ok) {
    napi_throw_error(env, nullptr, "Could not register research voice lifecycle."); return nullptr;
  }
  state.release();
  const napi_property_descriptor methods[] = {
    {"init", nullptr, Init, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setEnabled", nullptr, SetEnabled, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"cancel", nullptr, Cancel, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"dispose", nullptr, Dispose, nullptr, nullptr, nullptr, napi_default, nullptr},
#if SHERLOCK_VOICE_TESTING
    {"__testAuthorize", nullptr, TestAuthorize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"__testResult", nullptr, TestResult, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"__testTick", nullptr, TestTick, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"__testFn", nullptr, TestFn, nullptr, nullptr, nullptr, napi_default, nullptr},
#endif
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Register)
