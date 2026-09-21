#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <node_api.h>
#include <atomic>
#include <chrono>
#include <cmath>
#include <mutex>
#include <string>
#include <stdexcept>
#include <thread>
#include <vector>
#include <dlfcn.h>

struct StrokeJob {
  napi_async_work work; napi_deferred deferred;
  pid_t pid; uint32_t window; CGRect frame;
  std::vector<std::vector<CGPoint>> strokes;
  CGEventFlags flags=0; int64_t group=0; int clicks=0; int clickState=1; CGMouseButton button=kCGMouseButtonLeft;
  double duration; std::atomic<bool> cancelled{false}; std::string error;
};
static std::mutex lock;
static StrokeJob* active = nullptr;
static double number(napi_env env,napi_value obj,const char* key) {
  napi_value v; double d=NAN;
  if(napi_get_named_property(env,obj,key,&v)!=napi_ok || napi_get_value_double(env,v,&d)!=napi_ok) return NAN;
  return d;
}
// Targeted delivery only: never post into the global HID stream, warp the
// physical pointer, raise an app, or restore an old foreground app.
// Window routing fields follow Cua Driver's Chromium-compatible event recipe.
// See docs/licenses/cua-driver-MIT.txt and docs/research/computer-use-integration.md.
struct BackgroundTransport {
  using Post = void (*)(pid_t, CGEventRef);
  using Location = void (*)(CGEventRef, double, double);
  using Field = void (*)(CGEventRef, uint32_t, int64_t);
  using Connection = uint32_t (*)();
  using Owner = int32_t (*)(uint32_t,uint32_t,uint32_t*);
  using PSN = int32_t (*)(uint32_t,void*);
  using Front = int32_t (*)(void*);
  using Record = int32_t (*)(const void*,const uint8_t*);
  Post post=nullptr; Location location=nullptr; Field field=nullptr;
  Connection connection=nullptr; Owner owner=nullptr; PSN psn=nullptr; Front front=nullptr; Record record=nullptr;
  BackgroundTransport() {
    void* handle=dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_LOCAL);
    if(handle) {
      post=reinterpret_cast<Post>(dlsym(handle,"SLEventPostToPid"));
      location=reinterpret_cast<Location>(dlsym(handle,"CGEventSetWindowLocation"));
      field=reinterpret_cast<Field>(dlsym(handle,"SLEventSetIntegerValueField"));
      connection=reinterpret_cast<Connection>(dlsym(handle,"CGSMainConnectionID"));
      owner=reinterpret_cast<Owner>(dlsym(handle,"SLSGetWindowOwner"));
      psn=reinterpret_cast<PSN>(dlsym(handle,"SLSGetConnectionPSN"));
      front=reinterpret_cast<Front>(dlsym(handle,"_SLPSGetFrontProcess"));
      record=reinterpret_cast<Record>(dlsym(handle,"SLPSPostEventRecordTo"));
    }
  }
  bool available() const {return post && location && field && connection && owner && psn && front && record;}
  bool prepare(uint32_t window) const {
    // AppKit needs its input gate armed even with correctly window-routed
    // events. Match Cua's activate_without_raise recipe. Never call
    // SetFrontProcess, AXRaise, or move/restore the physical cursor.
    uint32_t current[2]={},target[2]={},cid=0;
    if(front(current)!=0 || owner(connection(),window,&cid)!=0 || psn(cid,target)!=0)return false;
    uint8_t bytes[0xF8]={};bytes[4]=0xF8;bytes[8]=0x0D;
    for(int i=0;i<4;i++)bytes[0x3C+i]=(window>>(8*i))&0xFF;
    if(current[0]!=target[0] || current[1]!=target[1]) {
      bytes[0x8A]=2;if(record(current,bytes)!=0)return false;
    }
    bytes[0x8A]=1;
    return record(target,bytes)==0;
  }
};
static BackgroundTransport transport;
static CGPoint progress=CGPointZero;
static bool hasProgress=false;
static bool sameWindow(StrokeJob* j) {
  // Look up the exact window, including when covered. Desktop hit-testing is
  // incorrect for background delivery: it selects the user's foreground app.
  NSArray* list=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,j->window));
  for(NSDictionary* w in list) {
    if([w[(id)kCGWindowNumber] unsignedIntValue]!=j->window)continue;
    if([w[(id)kCGWindowOwnerPID] intValue]!=j->pid || ![w[(id)kCGWindowIsOnscreen] boolValue])return false;
    CGRect b;
    if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds],&b))return false;
    return std::abs(b.origin.x-j->frame.origin.x)<1 && std::abs(b.origin.y-j->frame.origin.y)<1
      && std::abs(b.size.width-j->frame.size.width)<1 && std::abs(b.size.height-j->frame.size.height)<1;
  }
  return false;
}
static void post(StrokeJob* j,CGEventType type,CGPoint p,int phase=-1,bool primer=false) {
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);
  CGEventRef e=CGEventCreateMouseEvent(source,type,p,primer?kCGMouseButtonLeft:j->button);
  if(source)CFRelease(source);
  if(!e)throw std::runtime_error("无法创建后台鼠标事件");
  CGEventSetFlags(e,j->flags);
  transport.field(e,0,phase>=0?phase:(type==kCGEventMouseMoved?2:3));
  transport.field(e,1,type==kCGEventMouseMoved?0:j->clickState);
  transport.field(e,3,primer?kCGMouseButtonLeft:j->button);
  transport.field(e,7,3);
  transport.field(e,40,j->pid);
  transport.field(e,51,j->window);
  transport.field(e,58,j->group);
  transport.field(e,91,j->window);
  transport.field(e,92,j->window);
  transport.location(e,primer?-1:p.x-j->frame.origin.x,primer?-1:p.y-j->frame.origin.y);
  transport.post(j->pid,e);
  CFRelease(e);
  if(!primer){std::lock_guard<std::mutex> guard(lock);progress=p;hasProgress=true;}
}
static void execute(napi_env,void* raw) {
 @autoreleasepool {
  auto* j=static_cast<StrokeJob*>(raw); bool down=false; CGPoint last=CGPointZero;
  const CGEventType downType=j->button==kCGMouseButtonLeft?kCGEventLeftMouseDown:j->button==kCGMouseButtonRight?kCGEventRightMouseDown:kCGEventOtherMouseDown;
  const CGEventType upType=j->button==kCGMouseButtonLeft?kCGEventLeftMouseUp:j->button==kCGMouseButtonRight?kCGEventRightMouseUp:kCGEventOtherMouseUp;
  try {
    if(!AXIsProcessTrusted())throw std::runtime_error("需要 EWork 辅助功能权限");
    if(!transport.available())throw std::runtime_error("当前系统不支持后台绘制，未切换到前台输入");
    if(j->cancelled || !sameWindow(j))throw std::runtime_error("操作已取消或目标窗口发生变化");
    if(!transport.prepare(j->window))throw std::runtime_error("无法准备目标窗口后台输入，未切换前台");
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    if(j->cancelled || !sameWindow(j))throw std::runtime_error("操作已取消或目标窗口发生变化");
    // Off-window down/up primes Chromium's input gate without hitting DOM.
    post(j,kCGEventLeftMouseDown,CGPointMake(-1,-1),1,true);
    post(j,kCGEventLeftMouseUp,CGPointMake(-1,-1),2,true);
    if(j->clicks) {
      last=j->strokes.front().front();
      for(int pair=1;pair<=j->clicks;pair++) {
        if(j->cancelled || !sameWindow(j))throw std::runtime_error("点击已取消或目标窗口发生变化");
        j->clickState=pair;
        post(j,kCGEventMouseMoved,last);
        post(j,downType,last);down=true;
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
        post(j,upType,last);down=false;
        if(pair<j->clicks)std::this_thread::sleep_for(std::chrono::milliseconds(80));
      }
      return;
    }
    size_t segments=0;for(auto& s:j->strokes)segments+=s.size()-1;
    const double stepMs=j->duration/std::max<size_t>(segments,1);
    for(auto& s:j->strokes) {
      if(j->cancelled || !sameWindow(j))throw std::runtime_error(j->error.empty()?"绘制已取消或目标窗口发生变化":j->error);
      last=s.front();post(j,kCGEventMouseMoved,last);post(j,kCGEventLeftMouseDown,last);down=true;
      for(size_t i=1;i<s.size();i++) {
        const CGPoint from=last,to=s[i]; const int steps=std::max(1,(int)std::ceil(stepMs/8.0));
        for(int k=1;k<=steps;k++) {
          if(j->cancelled || !sameWindow(j))throw std::runtime_error(j->error.empty()?"绘制已停止或目标窗口发生变化":j->error);
          last=CGPointMake(from.x+(to.x-from.x)*k/steps,from.y+(to.y-from.y)*k/steps);
          post(j,kCGEventLeftMouseDragged,last);
          std::this_thread::sleep_for(std::chrono::microseconds((int)(stepMs*1000/steps)));
        }
      }
      post(j,kCGEventLeftMouseUp,last);down=false;
    }
  } catch(const std::exception& e) {j->error=e.what();}
  // Every exit, including stop and focus loss, releases the held button.
  if(down) {
    // Release only to the original target, never to the window under the cursor.
    try {post(j,upType,last);} catch(const std::exception&) {}
  }
 }
}
static void complete(napi_env env,napi_status status,void* raw) {
 auto* j=static_cast<StrokeJob*>(raw);
 {std::lock_guard<std::mutex> guard(lock);if(active==j){active=nullptr;hasProgress=false;}}
 napi_value result;
 if(status!=napi_ok || !j->error.empty()) {
  napi_value msg;napi_create_string_utf8(env,j->error.empty()?"绘制中止":j->error.c_str(),NAPI_AUTO_LENGTH,&msg);napi_create_error(env,nullptr,msg,&result);napi_reject_deferred(env,j->deferred,result);
 }else{napi_get_boolean(env,true,&result);napi_resolve_deferred(env,j->deferred,result);}
 napi_delete_async_work(env,j->work);delete j;
}
static napi_value draw(napi_env env,napi_callback_info info) {
 size_t argc=1;napi_value args[1];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);
 auto* j=new StrokeJob();
 const auto fail=[&](const char* msg)->napi_value{delete j;napi_throw_error(env,nullptr,msg);return nullptr;};
 if(argc!=1)return fail("缺少绘制参数");
 double pid=number(env,args[0],"pid"),wid=number(env,args[0],"window_id");j->duration=number(env,args[0],"duration_ms");
 if(!std::isfinite(pid)||pid<=0||pid>INT32_MAX||floor(pid)!=pid||!std::isfinite(wid)||wid<=0||wid>UINT32_MAX||floor(wid)!=wid||!std::isfinite(j->duration)||j->duration<100||j->duration>8000)return fail("无效绘制边界");
 j->pid=(pid_t)pid;j->window=(uint32_t)wid;
 napi_value frame,strokes;napi_get_named_property(env,args[0],"frame",&frame);napi_get_named_property(env,args[0],"strokes",&strokes);
 j->frame=CGRectMake(number(env,frame,"x"),number(env,frame,"y"),number(env,frame,"width"),number(env,frame,"height"));
 if(!std::isfinite(j->frame.origin.x)||!std::isfinite(j->frame.origin.y)||!std::isfinite(j->frame.size.width)||!std::isfinite(j->frame.size.height)||j->frame.size.width<=0||j->frame.size.height<=0)return fail("无效窗口范围");
 uint32_t count=0;bool arr=false;napi_is_array(env,strokes,&arr);
 if(!arr||napi_get_array_length(env,strokes,&count)!=napi_ok||!count||count>12)return fail("笔画数量应为 1 至 12");
 uint32_t total=0;
 for(uint32_t i=0;i<count;i++) {
  napi_value stroke;napi_get_element(env,strokes,i,&stroke);uint32_t n=0;napi_is_array(env,stroke,&arr);
  if(!arr||napi_get_array_length(env,stroke,&n)!=napi_ok||n<2||n>256||(total+=n)>768)return fail("笔画点数超限");
  std::vector<CGPoint> points;
  for(uint32_t k=0;k<n;k++) {napi_value p;napi_get_element(env,stroke,k,&p);CGPoint pt=CGPointMake(number(env,p,"x"),number(env,p,"y"));if(!std::isfinite(pt.x)||!std::isfinite(pt.y)||!CGRectContainsPoint(j->frame,pt))return fail("绘制点超出目标窗口");points.push_back(pt);}
  j->strokes.push_back(points);
 }
 double flags=number(env,args[0],"flags");
 if(!std::isfinite(flags)||flags<0||floor(flags)!=flags || flags>UINT32_MAX)return fail("无效修饰键");
 const uint64_t allowed=kCGEventFlagMaskShift|kCGEventFlagMaskControl|kCGEventFlagMaskAlternate|kCGEventFlagMaskCommand;
 if(static_cast<uint64_t>(flags)&~allowed)return fail("不支持的修饰键");
 double clicks=number(env,args[0],"clicks"),button=number(env,args[0],"button");
 if(!std::isfinite(clicks)||clicks<0||clicks>2||floor(clicks)!=clicks)return fail("无效点击次数");
 if(!std::isfinite(button)||button<0||button>2||floor(button)!=button)return fail("无效鼠标按键");
 if(clicks && (j->strokes.size()!=1 || j->strokes.front().size()!=2 || !CGPointEqualToPoint(j->strokes.front()[0],j->strokes.front()[1])))return fail("点击只能包含一个落点");
 if(!clicks && button!=0)return fail("后台拖拽只支持左键");
 j->clicks=static_cast<int>(clicks);j->button=static_cast<CGMouseButton>(button);
 j->flags=static_cast<CGEventFlags>(flags);
 j->group=std::chrono::steady_clock::now().time_since_epoch().count();
 {std::lock_guard<std::mutex> guard(lock);if(active)return fail("已有笔画正在执行");active=j;hasProgress=false;}
 napi_value promise,name;napi_create_promise(env,&j->deferred,&promise);napi_create_string_utf8(env,"ework.stroke",NAPI_AUTO_LENGTH,&name);
 napi_create_async_work(env,nullptr,name,execute,complete,j,&j->work);napi_queue_async_work(env,j->work);return promise;
}
static napi_value cancel(napi_env env,napi_callback_info) {std::lock_guard<std::mutex> guard(lock);if(active)active->cancelled=true;napi_value v;napi_get_undefined(env,&v);return v;}
static napi_value position(napi_env env,napi_callback_info) {
 std::lock_guard<std::mutex> guard(lock);napi_value result;
 if(!active||!hasProgress){napi_get_undefined(env,&result);return result;}
 napi_create_object(env,&result);napi_value x,y;napi_create_double(env,progress.x,&x);napi_create_double(env,progress.y,&y);
 napi_set_named_property(env,result,"x",x);napi_set_named_property(env,result,"y",y);return result;
}
static napi_value init(napi_env env,napi_value exports) {
 napi_property_descriptor props[]={{"draw",nullptr,draw,nullptr,nullptr,nullptr,napi_default,nullptr},{"cancel",nullptr,cancel,nullptr,nullptr,nullptr,napi_default,nullptr},{"position",nullptr,position,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(env,exports,3,props);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
