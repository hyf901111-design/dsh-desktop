#import <AppKit/AppKit.h>
#include <node_api.h>
#include <chrono>
#include <condition_variable>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// Public NSWorkspace APIs only. No global input, app activation, AppleScript,
// shell launch, arbitrary arguments, URLs, environment, or foreground fallback.
struct LaunchState {
  std::mutex mutex; std::condition_variable wake;
  bool cancelled=false, dispatched=false, finished=false, settled=false;
  int pid=0, foregroundBefore=0, foregroundAfter=0;
  std::string code="launch_unavailable", reason, path, bundle;
  NSArray<NSString*>* candidates=@[];
};
struct LaunchJob {
  napi_async_work work=nullptr; napi_deferred deferred=nullptr;
  std::string id, bundle, path; int timeout=15000;
  std::shared_ptr<LaunchState> state=std::make_shared<LaunchState>();
};
static std::mutex launchesMutex;
static std::map<std::string,std::weak_ptr<LaunchState>> launches;
static std::string value(NSString* text) { return text ? std::string(text.UTF8String ?: "") : ""; }
static NSString* string(const std::string& text) { return [NSString stringWithUTF8String:text.c_str()]; }
static NSString* canonical(NSURL* url) { return url.fileURL ? url.URLByResolvingSymlinksInPath.URLByStandardizingPath.path : nil; }
static std::string property(napi_env env,napi_value object,const char* key) {
  napi_value item; size_t size=0;
  if(napi_get_named_property(env,object,key,&item)!=napi_ok || napi_get_value_string_utf8(env,item,nullptr,0,&size)!=napi_ok || size>4096)return "";
  std::string output(size+1,'\0');
  napi_get_value_string_utf8(env,item,output.data(),output.size(),&size);output.resize(size);return output;
}
static void executeLaunch(napi_env,void* raw) {
 @autoreleasepool {
  auto* job=static_cast<LaunchJob*>(raw);auto state=job->state;
  const auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(job->timeout);
  {std::lock_guard<std::mutex> guard(state->mutex);if(state->cancelled){state->code="launch_cancelled_before_dispatch";state->reason="启动投递前已取消，未启动。";return;}}
  // Discovery happens before dispatch, and includes all installed copies and
  // every running instance. Never silently substitute another bundle URL.
  NSString* bundle=string(job->bundle);
  NSMutableSet<NSString*>* paths=[NSMutableSet set];
  for(NSURL* url in [NSWorkspace.sharedWorkspace URLsForApplicationsWithBundleIdentifier:bundle]) {
    NSString* path=canonical(url);if(path)[paths addObject:path];
  }
  for(NSRunningApplication* running in NSWorkspace.sharedWorkspace.runningApplications) {
    if([running.bundleIdentifier isEqualToString:bundle]) { NSString* path=canonical(running.bundleURL);if(path)[paths addObject:path]; }
  }
  NSString* selected=nil;
  if(!job->path.empty()) {
    NSURL* requested=[NSURL fileURLWithPath:string(job->path)];selected=canonical(requested);
    NSBundle* app=selected ? [NSBundle bundleWithPath:selected] : nil;
    if(![requested.path isAbsolutePath] || ![selected.pathExtension isEqualToString:@"app"] || ![app.bundleIdentifier isEqualToString:bundle]) {
      state->code="application_identity_mismatch";state->reason="准确应用路径与已发现的 bundle_id 不匹配，未启动。";return;
    }
    // The host accepts paths only from its fresh list_apps result; native code
    // independently checks bundle identity instead of accepting a shell path.
    [paths addObject:selected];
  } else if(paths.count==1) selected=paths.anyObject;
  else {
    state->candidates=[[paths allObjects] sortedArrayUsingSelector:@selector(compare:)];
    state->code=paths.count ? "application_ambiguous" : "application_not_found";
    state->reason=paths.count ? "存在多个同 bundle 的应用副本，请用 apps 返回的准确 launch_path 重新选择；未启动。" : "没有找到可验证的应用 URL，未启动。";return;
  }
  state->path=value(selected);state->bundle=job->bundle;
  NSMutableArray<NSRunningApplication*>* exact=[NSMutableArray array];
  for(NSRunningApplication* running in NSWorkspace.sharedWorkspace.runningApplications)
    if([running.bundleIdentifier isEqualToString:bundle] && [canonical(running.bundleURL) isEqualToString:selected])[exact addObject:running];
  if(exact.count) {
    state->code=exact.count==1 ? "application_already_running" : "application_ambiguous";
    if(exact.count==1)state->pid=exact.firstObject.processIdentifier;
    state->reason=exact.count==1 ? "准确应用已运行；仅返回 PID，未激活或重新打开。" : "准确应用副本存在多个运行实例，请选择 PID；未激活或重新打开。";return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    std::lock_guard<std::mutex> guard(state->mutex);
    if(state->cancelled || std::chrono::steady_clock::now()>=deadline) {
      state->code=state->cancelled ? "launch_cancelled_before_dispatch" : "launch_timeout_before_dispatch";
      state->reason="启动投递前已取消或超时，未启动。";state->finished=true;state->wake.notify_all();return;
    }
    NSWorkspaceOpenConfiguration* config=[NSWorkspaceOpenConfiguration configuration];
    config.activates=NO;
    config.allowsRunningApplicationSubstitution=NO;
    config.createsNewApplicationInstance=NO;
    config.promptsUserIfNeeded=NO;
    config.addsToRecentItems=NO;
    state->foregroundBefore=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    state->dispatched=true;
    [NSWorkspace.sharedWorkspace openApplicationAtURL:[NSURL fileURLWithPath:selected] configuration:config completionHandler:^(NSRunningApplication* app,NSError* error) {
      std::lock_guard<std::mutex> completeGuard(state->mutex);
      // A late callback only owns shared state; the N-API job may already have
      // completed after its bounded deadline, so it never touches JS or a job.
      if(state->settled)return;
      state->foregroundAfter=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
      if(app && !error && [app.bundleIdentifier isEqualToString:bundle] && [canonical(app.bundleURL) isEqualToString:selected]) {
        state->pid=app.processIdentifier;state->code="application_started";
        state->reason="已向准确应用 URL 投递后台启动，请观察返回的 PID 和窗口验证结果。";
        if(state->foregroundAfter==state->pid && state->foregroundBefore!=state->pid) {
          state->code="launch_focus_changed";state->reason="系统按不激活方式启动，但目标应用随后成为前台；停止进一步输入，不自动切回或重试。";
        }
      } else {
        state->code="launch_result_uncertain";
        state->reason=value(error.localizedDescription ?: @"后台启动回报的应用身份不匹配；结果未确认，不自动重试。");
      }
      state->finished=true;state->wake.notify_all();
    }];
  });
  std::unique_lock<std::mutex> guard(state->mutex);
  state->wake.wait_until(guard,deadline,[&]{return state->cancelled || state->finished;});
  if(state->cancelled) {
    state->code=state->dispatched ? "launch_cancelled_after_dispatch" : "launch_cancelled_before_dispatch";
    state->reason=state->dispatched ? "启动投递后已取消，应用可能已启动；请先重新发现 PID 和窗口，不自动重试。" : "启动投递前已取消，未启动。";
  } else if(!state->finished) {
    state->code=state->dispatched ? "launch_timeout_after_dispatch" : "launch_timeout_before_dispatch";
    state->reason=state->dispatched ? "后台启动等待超时，应用可能已启动；请先重新发现 PID 和窗口，不自动重试。" : "后台启动尚未投递即超时，未启动。";
    // Prevent a main-queue dispatch which has not run yet from acting later.
    if(!state->dispatched)state->cancelled=true;
  }
  state->settled=true;
 }
}
static void setText(napi_env env,napi_value object,const char* key,const std::string& text) {
  napi_value value;napi_create_string_utf8(env,text.c_str(),text.size(),&value);napi_set_named_property(env,object,key,value);
}
static void setInteger(napi_env env,napi_value object,const char* key,int number) {
  napi_value value;napi_create_int32(env,number,&value);napi_set_named_property(env,object,key,value);
}
struct InspectedApplication { std::string name,bundle,path; int pid=0; bool active=false; };
struct InspectJob {
  napi_async_work work=nullptr; napi_deferred deferred=nullptr;
  std::string bundle,path,code="application_identity_mismatch",reason;
  std::vector<InspectedApplication> apps;
};
static void executeInspect(napi_env,void* raw) {
 @autoreleasepool {
  auto* job=static_cast<InspectJob*>(raw);
  NSString* path=job->path.empty() ? nil : canonical([NSURL fileURLWithPath:string(job->path)]);
  NSBundle* app=path ? [NSBundle bundleWithPath:path] : nil;
  if(job->bundle.empty() || job->path.empty() || ![string(job->path) isAbsolutePath] || ![path.pathExtension isEqualToString:@"app"] || ![app.bundleIdentifier isEqualToString:string(job->bundle)]) {
    job->reason="准确 .app 路径与 bundle_id 不匹配，未运行任何应用。";return;
  }
  NSString* name=app.localizedInfoDictionary[@"CFBundleDisplayName"] ?: app.infoDictionary[@"CFBundleDisplayName"] ?: app.infoDictionary[@"CFBundleName"];
  if(![name isKindOfClass:NSString.class])name=path.lastPathComponent.stringByDeletingPathExtension;
  for(NSRunningApplication* running in NSWorkspace.sharedWorkspace.runningApplications)
    if([running.bundleIdentifier isEqualToString:string(job->bundle)] && [canonical(running.bundleURL) isEqualToString:path])
      job->apps.push_back({value(name),job->bundle,value(path),running.processIdentifier,running.active==YES});
  if(job->apps.empty())job->apps.push_back({value(name),job->bundle,value(path),0,false});
  job->code="application_identity_verified";
 }
}
static void completeInspect(napi_env env,napi_status status,void* raw) {
  auto* job=static_cast<InspectJob*>(raw);napi_value result,apps;napi_create_object(env,&result);napi_create_array(env,&apps);
  if(status==napi_ok) {
    uint32_t index=0;
    for(const auto& app:job->apps) {
      napi_value item,running,active;napi_create_object(env,&item);napi_get_boolean(env,app.pid>0,&running);napi_get_boolean(env,app.active,&active);
      setText(env,item,"name",app.name);setText(env,item,"bundle_id",app.bundle);setText(env,item,"launch_path",app.path);
      napi_set_named_property(env,item,"running",running);napi_set_named_property(env,item,"active",active);
      if(app.pid>0)setInteger(env,item,"pid",app.pid);napi_set_element(env,apps,index++,item);
    }
  }
  napi_set_named_property(env,result,"apps",apps);setText(env,result,"code",status==napi_ok ? job->code : "application_inspection_cancelled");setText(env,result,"reason",job->reason);
  napi_resolve_deferred(env,job->deferred,result);napi_delete_async_work(env,job->work);delete job;
}
static napi_value inspect(napi_env env,napi_callback_info info) {
  size_t argc=1;napi_value args[1];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);auto* job=new InspectJob();
  if(argc==1){job->bundle=property(env,args[0],"bundle_id");job->path=property(env,args[0],"launch_path");}
  napi_value promise,name;
  if(napi_create_promise(env,&job->deferred,&promise)!=napi_ok || napi_create_string_utf8(env,"ework.application-inspection",NAPI_AUTO_LENGTH,&name)!=napi_ok
      || napi_create_async_work(env,nullptr,name,executeInspect,completeInspect,job,&job->work)!=napi_ok || napi_queue_async_work(env,job->work)!=napi_ok) {
    if(job->work)napi_delete_async_work(env,job->work);delete job;napi_throw_error(env,nullptr,"无法创建只读应用解析任务。");return nullptr;
  }
  return promise;
}
static void completeLaunch(napi_env env,napi_status status,void* raw) {
  auto* job=static_cast<LaunchJob*>(raw);auto state=job->state;
  {std::lock_guard<std::mutex> guard(launchesMutex);launches.erase(job->id);}
  napi_value result,performed,dispatched;napi_create_object(env,&result);
  {std::lock_guard<std::mutex> guard(state->mutex);
    const bool success=status==napi_ok && state->code=="application_started";
    if(state->dispatched && !success)napi_get_null(env,&performed);else napi_get_boolean(env,success,&performed);
    napi_get_boolean(env,state->dispatched,&dispatched);
    napi_set_named_property(env,result,"performed",performed);napi_set_named_property(env,result,"dispatched",dispatched);
    if(state->code=="launch_focus_changed"){napi_value terminal;napi_get_boolean(env,true,&terminal);napi_set_named_property(env,result,"terminal",terminal);}
    setText(env,result,"code",state->code);setText(env,result,"effect",success ? "application_started" : state->dispatched ? "unknown" : "not_dispatched");
    setText(env,result,"delivery_mode","background");setText(env,result,"reason",state->reason);
    setText(env,result,"bundle_id",state->bundle);setText(env,result,"launch_path",state->path);
    if(state->pid>0)setInteger(env,result,"pid",state->pid);
    if(state->dispatched){setInteger(env,result,"foreground_before",state->foregroundBefore);if(state->finished)setInteger(env,result,"foreground_after",state->foregroundAfter);}
    if(state->candidates.count) {napi_value paths;napi_create_array_with_length(env,state->candidates.count,&paths);uint32_t index=0;for(NSString* path in state->candidates){napi_value text;napi_create_string_utf8(env,path.UTF8String,NAPI_AUTO_LENGTH,&text);napi_set_element(env,paths,index++,text);}napi_set_named_property(env,result,"candidates",paths);}
  }
  napi_resolve_deferred(env,job->deferred,result);napi_delete_async_work(env,job->work);delete job;
}
static napi_value launch(napi_env env,napi_callback_info info) {
  size_t argc=1;napi_value args[1];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);
  auto* job=new LaunchJob();
  if(argc==1) {job->id=property(env,args[0],"request_id");job->bundle=property(env,args[0],"bundle_id");job->path=property(env,args[0],"launch_path");}
  if(job->id.empty() || job->bundle.empty()) {delete job;napi_throw_error(env,nullptr,"缺少宿主启动身份");return nullptr;}
  {std::lock_guard<std::mutex> guard(launchesMutex);if(!launches.empty()){delete job;napi_throw_error(env,nullptr,"已有后台启动尚未完成");return nullptr;}launches[job->id]=job->state;}
  napi_value promise,name;
  if(napi_create_promise(env,&job->deferred,&promise)!=napi_ok || napi_create_string_utf8(env,"ework.background-launch",NAPI_AUTO_LENGTH,&name)!=napi_ok
      || napi_create_async_work(env,nullptr,name,executeLaunch,completeLaunch,job,&job->work)!=napi_ok || napi_queue_async_work(env,job->work)!=napi_ok) {
    {std::lock_guard<std::mutex> guard(launchesMutex);launches.erase(job->id);}
    if(job->work)napi_delete_async_work(env,job->work);delete job;napi_throw_error(env,nullptr,"无法创建有界后台启动任务，未投递启动。");return nullptr;
  }
  return promise;
}
static napi_value cancelLaunch(napi_env env,napi_callback_info info) {
  size_t argc=1;napi_value args[1];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);size_t size=0;
  if(argc==1 && napi_get_value_string_utf8(env,args[0],nullptr,0,&size)==napi_ok && size<=256) {
    std::string id(size+1,'\0');napi_get_value_string_utf8(env,args[0],id.data(),id.size(),&size);id.resize(size);
    std::shared_ptr<LaunchState> state;
    {std::lock_guard<std::mutex> guard(launchesMutex);auto found=launches.find(id);if(found!=launches.end())state=found->second.lock();}
    if(state){std::lock_guard<std::mutex> guard(state->mutex);state->cancelled=true;state->wake.notify_all();}
  }
  napi_value result;napi_get_undefined(env,&result);return result;
}
static napi_value init(napi_env env,napi_value exports) {
  napi_property_descriptor properties[]={{"inspect",nullptr,inspect,nullptr,nullptr,nullptr,napi_default,nullptr},{"launch",nullptr,launch,nullptr,nullptr,nullptr,napi_default,nullptr},{"cancelLaunch",nullptr,cancelLaunch,nullptr,nullptr,nullptr,napi_default,nullptr}};
  napi_define_properties(env,exports,3,properties);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
