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

struct StrokeJob {
  napi_async_work work; napi_deferred deferred;
  pid_t pid; uint32_t window; CGRect frame; CGRect ink; CGPoint probe;
  std::vector<std::vector<CGPoint>> strokes;
  double duration; std::atomic<bool> cancelled{false}; std::string error;
};
static std::mutex lock;
static StrokeJob* active = nullptr;
static double number(napi_env env,napi_value obj,const char* key) {
  napi_value v; double d=NAN;
  if(napi_get_named_property(env,obj,key,&v)!=napi_ok || napi_get_value_double(env,v,&d)!=napi_ok) return NAN;
  return d;
}
static bool hitTarget(StrokeJob* j, CGPoint point) {
  AXUIElementRef system=AXUIElementCreateSystemWide(), element=nullptr;
  AXError error=AXUIElementCopyElementAtPosition(system,point.x,point.y,&element);
  CFRelease(system);
  if(error!=kAXErrorSuccess || !element)return false;
  pid_t pid=0; AXUIElementGetPid(element,&pid); CFRelease(element);
  return pid==j->pid;
}
static bool sameWindow(StrokeJob* j) {
  // Check the actual drawing envelope in WindowServer order. Some Electron
  // apps place small helper/header windows above their main window; those must
  // not prevent drawing in an unobscured canvas far from the helper window.
  NSArray* list=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,kCGNullWindowID));
  for(NSDictionary* w in list) {
    if(([w[(id)kCGWindowOwnerPID] intValue]==getpid() && [w[(id)kCGWindowLayer] intValue]>=25) || [w[(id)kCGWindowAlpha] doubleValue]<=0) continue;
    CGRect b; if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds],&b))continue;
    if(!CGRectIntersectsRect(b,j->ink))continue;
    // Remote desktop cursor surfaces may span a display without receiving
    // input. Verify the actual OS hit target; never whitelist their owner.
    if([w[(id)kCGWindowLayer] intValue]>=CGWindowLevelForKey(kCGCursorWindowLevelKey) && hitTarget(j,j->probe))continue;
    if([w[(id)kCGWindowOwnerPID] intValue]!=j->pid || [w[(id)kCGWindowNumber] unsignedIntValue]!=j->window){j->error="绘制区域被窗口 " + std::to_string([w[(id)kCGWindowNumber] unsignedIntValue]) + " 遮挡，未继续输入";return false;}
    return std::abs(b.origin.x-j->frame.origin.x)<2 && std::abs(b.origin.y-j->frame.origin.y)<2 && std::abs(b.size.width-j->frame.size.width)<2 && std::abs(b.size.height-j->frame.size.height)<2;
  }
  return false;
}
static void post(CGEventType type,CGPoint p) {
  CGEventRef e=CGEventCreateMouseEvent(nullptr,type,p,kCGMouseButtonLeft);
  if(e){CGEventSetFlags(e,0);CGEventPost(kCGHIDEventTap,e);CFRelease(e);}
}
static void execute(napi_env,void* raw) {
 @autoreleasepool {
  auto* j=static_cast<StrokeJob*>(raw); bool down=false; CGPoint last=CGPointZero;
  try {
    if(!AXIsProcessTrusted())throw std::runtime_error("需要 EWork 辅助功能权限");
    size_t emitted=0;
    size_t segments=0;for(auto& s:j->strokes)segments+=s.size()-1;
    const double stepMs=j->duration/std::max<size_t>(segments,1);
    for(auto& s:j->strokes) {
      j->probe=s.front();
      if(j->cancelled || [NSWorkspace.sharedWorkspace.frontmostApplication processIdentifier]!=j->pid || !sameWindow(j))throw std::runtime_error(j->error.empty()?"绘制已取消或目标窗口发生变化":j->error);
      last=s.front();post(kCGEventMouseMoved,last);post(kCGEventLeftMouseDown,last);down=true;
      for(size_t i=1;i<s.size();i++) {
        const CGPoint from=last,to=s[i]; const int steps=std::max(1,(int)std::ceil(stepMs/8.0));
        for(int k=1;k<=steps;k++) {
          j->probe=CGPointMake(from.x+(to.x-from.x)*k/steps,from.y+(to.y-from.y)*k/steps);
          if(j->cancelled || [NSWorkspace.sharedWorkspace.frontmostApplication processIdentifier]!=j->pid || (++emitted % 12 == 0 && !sameWindow(j)))throw std::runtime_error(j->error.empty()?"绘制已停止或用户切换了应用":j->error);
          last=CGPointMake(from.x+(to.x-from.x)*k/steps,from.y+(to.y-from.y)*k/steps);
          post(kCGEventLeftMouseDragged,last);
          std::this_thread::sleep_for(std::chrono::microseconds((int)(stepMs*1000/steps)));
        }
      }
      post(kCGEventLeftMouseUp,last);down=false;
    }
  } catch(const std::exception& e) {j->error=e.what();}
  // Every exit, including stop and focus loss, releases the held button.
  if(down)post(kCGEventLeftMouseUp,last);
 }
}
static void complete(napi_env env,napi_status status,void* raw) {
 auto* j=static_cast<StrokeJob*>(raw);
 {std::lock_guard<std::mutex> guard(lock);if(active==j)active=nullptr;}
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
 uint32_t total=0; double minX=INFINITY,minY=INFINITY,maxX=-INFINITY,maxY=-INFINITY;
 for(uint32_t i=0;i<count;i++) {
  napi_value stroke;napi_get_element(env,strokes,i,&stroke);uint32_t n=0;napi_is_array(env,stroke,&arr);
  if(!arr||napi_get_array_length(env,stroke,&n)!=napi_ok||n<2||n>256||(total+=n)>768)return fail("笔画点数超限");
  std::vector<CGPoint> points;
  for(uint32_t k=0;k<n;k++) {napi_value p;napi_get_element(env,stroke,k,&p);CGPoint pt=CGPointMake(number(env,p,"x"),number(env,p,"y"));if(!std::isfinite(pt.x)||!std::isfinite(pt.y)||!CGRectContainsPoint(j->frame,pt))return fail("绘制点超出目标窗口");minX=std::min(minX,pt.x);minY=std::min(minY,pt.y);maxX=std::max(maxX,pt.x);maxY=std::max(maxY,pt.y);points.push_back(pt);}
  j->strokes.push_back(points);
 }
 j->ink=CGRectMake(minX-2,minY-2,maxX-minX+4,maxY-minY+4);
 {std::lock_guard<std::mutex> guard(lock);if(active)return fail("已有笔画正在执行");active=j;}
 napi_value promise,name;napi_create_promise(env,&j->deferred,&promise);napi_create_string_utf8(env,"ework.stroke",NAPI_AUTO_LENGTH,&name);
 napi_create_async_work(env,nullptr,name,execute,complete,j,&j->work);napi_queue_async_work(env,j->work);return promise;
}
static napi_value cancel(napi_env env,napi_callback_info) {std::lock_guard<std::mutex> guard(lock);if(active)active->cancelled=true;napi_value v;napi_get_undefined(env,&v);return v;}
static napi_value init(napi_env env,napi_value exports) {
 napi_property_descriptor props[]={{"draw",nullptr,draw,nullptr,nullptr,nullptr,napi_default,nullptr},{"cancel",nullptr,cancel,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(env,exports,2,props);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
