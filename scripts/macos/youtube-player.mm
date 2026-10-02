#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <node_api.h>
#include <stdexcept>
#include <string>
#include <cstring>
#include <cmath>

// The player and its ordinary website sign-in window share WebKit's store.
// No cookie, credential, OAuth token or login-page pixels cross the Node boundary.
@interface EWorkYoutubePlayer : NSObject <WKNavigationDelegate, WKUIDelegate, NSWindowDelegate>
@property(nonatomic,weak) NSView *host;
@property(nonatomic,strong) WKWebView *view;
@property(nonatomic,strong) WKWebView *loginView;
@property(nonatomic,strong) NSWindow *loginWindow;
@property(nonatomic,copy) NSString *url;
@property(nonatomic,copy) NSString *referer;
@property(nonatomic,copy) NSString *image;
@property(nonatomic,copy) NSString *error;
@property(nonatomic,copy) NSString *loginStatus;
@property(nonatomic) NSUInteger imageRevision;
@property(nonatomic) BOOL loading;
@property(nonatomic) BOOL snapshotBusy;
@property(nonatomic) CFAbsoluteTime capturedAt;
- (void)loadPlayer;
- (void)beginLogin;
- (void)returnToPlayer;
- (void)capturePlayer;
- (void)dispose;
@end

static BOOL trustedHTTPS(NSURL *url, NSArray<NSString *> *hosts) {
 return [url.scheme isEqualToString:@"https"] && !url.user && !url.password && !url.port && [hosts containsObject:url.host.lowercaseString];
}
static BOOL googleWebsiteLogin(NSURL *url) {
 return trustedHTTPS(url,@[@"accounts.google.com"]) && ![url.path hasPrefix:@"/o/"] && ![url.path hasPrefix:@"/oauth2/"];
}
@implementation EWorkYoutubePlayer
- (void)loadPlayer {
 self.error=@"";self.loading=YES;self.capturedAt=0;
 NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:self.url]];
 [request setValue:self.referer forHTTPHeaderField:@"Referer"];
 [self.view loadRequest:request];
}
- (void)beginLogin {
 if(self.loginWindow){[self.loginWindow makeKeyAndOrderFront:nil];return;}
 if(!self.host.window)return;
 self.loginStatus=@"pending";
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];
 config.websiteDataStore=self.view.configuration.websiteDataStore;
 self.loginView=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,560,640) configuration:config];
 self.loginView.navigationDelegate=self;self.loginView.UIDelegate=self;
 self.loginWindow=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,560,640) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
 self.loginWindow.releasedWhenClosed=NO;self.loginWindow.title=@"登录 YouTube · 完成后返回原组件";self.loginWindow.delegate=self;
 self.loginWindow.contentView=self.loginView;
 NSRect parent=self.host.window.frame;
 [self.loginWindow setFrameOrigin:NSMakePoint(NSMidX(parent)-280,NSMidY(parent)-320)];
 [self.host.window addChildWindow:self.loginWindow ordered:NSWindowAbove];
 [self.loginWindow makeKeyAndOrderFront:nil];
 NSURLComponents *original=[NSURLComponents componentsWithString:self.url];
 NSString *video=original.path.lastPathComponent,*start=@"0";
 for(NSURLQueryItem *item in original.queryItems)if([item.name isEqualToString:@"start"])start=item.value;
 NSURLComponents *watch=[NSURLComponents componentsWithString:@"https://www.youtube.com/watch"];
 watch.queryItems=@[[NSURLQueryItem queryItemWithName:@"v" value:video],[NSURLQueryItem queryItemWithName:@"t" value:[start stringByAppendingString:@"s"]]];
 NSURLComponents *resume=[NSURLComponents componentsWithString:@"https://www.youtube.com/signin"];
 resume.queryItems=@[[NSURLQueryItem queryItemWithName:@"action_handle_signin" value:@"true"],[NSURLQueryItem queryItemWithName:@"next" value:[@"/watch?" stringByAppendingString:watch.percentEncodedQuery]]];
 NSURLComponents *login=[NSURLComponents componentsWithString:@"https://accounts.google.com/ServiceLogin"];
 login.queryItems=@[[NSURLQueryItem queryItemWithName:@"service" value:@"youtube"],[NSURLQueryItem queryItemWithName:@"continue" value:resume.string]];
 [self.loginView loadRequest:[NSURLRequest requestWithURL:login.URL]];
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
 NSURL *url=action.request.URL;
 if(webView==self.view&&googleWebsiteLogin(url)){handler(WKNavigationActionPolicyCancel);[self beginLogin];return;}
 if(!action.targetFrame.mainFrame&&action.targetFrame){handler(WKNavigationActionPolicyAllow);return;}
 if(webView==self.loginView&&trustedHTTPS(url,@[@"www.youtube.com",@"youtube.com"])&&[@[@"/watch",@"/",@"/post_login"] containsObject:url.path]){handler(WKNavigationActionPolicyCancel);[self returnToPlayer];return;}
 if(webView==self.view){
  if([url.absoluteString isEqualToString:self.url]){handler(WKNavigationActionPolicyAllow);return;}
  handler(WKNavigationActionPolicyCancel);
  if(action.navigationType==WKNavigationTypeLinkActivated&&trustedHTTPS(url,@[@"www.youtube.com",@"youtube.com",@"support.google.com"]))[[NSWorkspace sharedWorkspace] openURL:url];
  return;
 }
 // Ordinary Google website sign-in only. OAuth remains in the system browser.
 BOOL allowed=googleWebsiteLogin(url)||trustedHTTPS(url,@[@"www.youtube.com",@"youtube.com"]);
 handler(allowed?WKNavigationActionPolicyAllow:WKNavigationActionPolicyCancel);
}
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
 (void)configuration;(void)features;
 if(webView==self.view&&googleWebsiteLogin(action.request.URL))[self beginLogin];
 else if(webView==self.loginView&&googleWebsiteLogin(action.request.URL))[webView loadRequest:action.request];
 else if(trustedHTTPS(action.request.URL,@[@"www.youtube.com",@"youtube.com",@"support.google.com"]))[[NSWorkspace sharedWorkspace] openURL:action.request.URL];
 return nil;
}
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
 (void)navigation;
 if(webView==self.view){self.loading=NO;self.error=@"";[self capturePlayer];return;}
 NSURL *url=webView.URL;
 if(trustedHTTPS(url,@[@"www.youtube.com",@"youtube.com"])&&[@[@"/watch",@"/",@"/post_login"] containsObject:url.path]){
  [self returnToPlayer];
 }
}
- (void)returnToPlayer {
 // A navigation return is not proof of authentication or successful playback.
 self.loginStatus=@"returned";
 [self.loginWindow close];[self loadPlayer];[self.host.window makeKeyAndOrderFront:nil];
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
 (void)navigation;
 if(webView==self.view&&error.code!=NSURLErrorCancelled){self.loading=NO;self.error=@"系统播放器暂时无法载入，请重试或在浏览器观看。";}
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
 [self webView:webView didFailProvisionalNavigation:navigation withError:error];
}
- (void)windowWillClose:(NSNotification *)notification {
 if(notification.object!=self.loginWindow)return;
 if([self.loginStatus isEqualToString:@"pending"])self.loginStatus=@"cancelled";
 [self.host.window removeChildWindow:self.loginWindow];self.loginView.navigationDelegate=nil;self.loginView.UIDelegate=nil;
 self.loginWindow.delegate=nil;self.loginWindow=nil;self.loginView=nil;
}
- (void)capturePlayer {
 if(self.loading||self.snapshotBusy||self.view.bounds.size.width<1||self.view.bounds.size.height<1||CFAbsoluteTimeGetCurrent()-self.capturedAt<1)return;
 self.snapshotBusy=YES;self.capturedAt=CFAbsoluteTimeGetCurrent();
 __weak EWorkYoutubePlayer *weakSelf=self;
 [self.view takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image,NSError *error){
  EWorkYoutubePlayer *player=weakSelf;if(!player)return;player.snapshotBusy=NO;
  if(error||!image)return;
  NSBitmapImageRep *bitmap=[NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];
  NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  if(png){player.image=[@"data:image/png;base64," stringByAppendingString:[png base64EncodedStringWithOptions:0]];player.imageRevision++;}
 }];
}
- (void)dispose {
 [self.loginWindow close];[self.view stopLoading];self.view.navigationDelegate=nil;self.view.UIDelegate=nil;
 [self.view removeFromSuperview];self.view=nil;self.host=nil;
}
@end

static NSMutableDictionary<NSString *,EWorkYoutubePlayer *> *players;
static NSString *textArg(napi_env env,napi_value value) {
 size_t size=0;if(napi_get_value_string_utf8(env,value,nullptr,0,&size)!=napi_ok||size>8192)throw std::runtime_error("Invalid player argument");
 std::string text(size+1,'\0');napi_get_value_string_utf8(env,value,text.data(),text.size(),&size);
 NSString *result=[[NSString alloc] initWithBytes:text.data() length:size encoding:NSUTF8StringEncoding];if(!result)throw std::runtime_error("Invalid player text");return result;
}
static double numberArg(napi_env env,napi_value value) {double number=0;if(napi_get_value_double(env,value,&number)!=napi_ok||!std::isfinite(number))throw std::runtime_error("Invalid player geometry");return number;}
static void mainThread(){if(!NSThread.isMainThread)throw std::runtime_error("System player requires the main thread");}
static napi_value done(napi_env env){napi_value result;napi_get_undefined(env,&result);return result;}
static napi_value mount(napi_env env,napi_callback_info info){try{
 mainThread();size_t argc=4;napi_value args[4];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);if(argc!=4)throw std::runtime_error("Invalid player mount");
 void *buffer=nullptr;size_t bytes=0;if(napi_get_buffer_info(env,args[0],&buffer,&bytes)!=napi_ok||bytes!=sizeof(void *))throw std::runtime_error("Invalid host handle");
 void *pointer=nullptr;std::memcpy(&pointer,buffer,sizeof(pointer));if(!pointer)throw std::runtime_error("Host unavailable");
 NSView *host=(__bridge NSView *)pointer;
 NSString *key=textArg(env,args[1]),*url=textArg(env,args[2]),*referer=textArg(env,args[3]);
 NSURL *target=[NSURL URLWithString:url];NSRegularExpression *path=[NSRegularExpression regularExpressionWithPattern:@"^/embed/[A-Za-z0-9_-]{11}$" options:0 error:nil];
 if(!trustedHTTPS(target,@[@"www.youtube.com"])||![path numberOfMatchesInString:target.path options:0 range:NSMakeRange(0,target.path.length)]||!host.window)throw std::runtime_error("Invalid official player");
 if(!players)players=[NSMutableDictionary new];[players[key] dispose];
 EWorkYoutubePlayer *player=[EWorkYoutubePlayer new];player.host=host;player.url=url;player.referer=referer;player.image=@"";player.error=@"";player.loginStatus=@"idle";
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.mediaTypesRequiringUserActionForPlayback=WKAudiovisualMediaTypeAll;
 player.view=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,480,270) configuration:config];player.view.navigationDelegate=player;player.view.UIDelegate=player;player.view.hidden=YES;
 [host addSubview:player.view positioned:NSWindowAbove relativeTo:nil];players[key]=player;[player loadPlayer];return done(env);
 }catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}}
static napi_value place(napi_env env,napi_callback_info info){try{
 mainThread();size_t argc=6;napi_value args[6];napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);if(argc!=6)throw std::runtime_error("Invalid player placement");
 EWorkYoutubePlayer *player=players[textArg(env,args[0])];if(!player)return done(env);
 double x=numberArg(env,args[1]),y=numberArg(env,args[2]),width=numberArg(env,args[3]),height=numberArg(env,args[4]);bool visible=false;if(napi_get_value_bool(env,args[5],&visible)!=napi_ok)throw std::runtime_error("Invalid player visibility");
 if(width<1||height<1||width>4096||height>4096)throw std::runtime_error("Invalid player size");
 if(visible){NSRect bounds=player.host.bounds;double top=player.host.isFlipped?y:bounds.size.height-y-height;player.view.frame=NSMakeRect(x,top,width,height);}
 player.view.hidden=!visible;return done(env);
 }catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}}
static napi_value state(napi_env env,napi_callback_info info){try{
 mainThread();size_t argc=1;napi_value arg;napi_get_cb_info(env,info,&argc,&arg,nullptr,nullptr);if(argc!=1)throw std::runtime_error("Invalid player identity");
 EWorkYoutubePlayer *player=players[textArg(env,arg)];if(!player)throw std::runtime_error("Player unavailable");[player capturePlayer];
 napi_value result,value;napi_create_object(env,&result);
 napi_get_boolean(env,player.loading,&value);napi_set_named_property(env,result,"loading",value);
 for(NSString *key in @[@"image",@"error",@"loginStatus"]){NSString *text=[player valueForKey:key];napi_create_string_utf8(env,text.UTF8String,NAPI_AUTO_LENGTH,&value);napi_set_named_property(env,result,key.UTF8String,value);}
 napi_create_double(env,player.imageRevision,&value);napi_set_named_property(env,result,"imageRevision",value);return result;
 }catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}}
static napi_value action(napi_env env,napi_callback_info info){try{
 mainThread();size_t argc=1;napi_value arg;void *data=nullptr;napi_get_cb_info(env,info,&argc,&arg,nullptr,&data);if(argc!=1)throw std::runtime_error("Invalid player identity");
 NSString *key=textArg(env,arg);EWorkYoutubePlayer *player=players[key];int kind=(int)(intptr_t)data;
 if(kind==1)[player beginLogin];else if(kind==2)[player loadPlayer];else{[player dispose];[players removeObjectForKey:key];}return done(env);
 }catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}}
static napi_value initialize(napi_env env,napi_value exports){
 napi_property_descriptor properties[]={{"mount",0,mount,0,0,0,napi_default,0},{"place",0,place,0,0,0,napi_default,0},{"state",0,state,0,0,0,napi_default,0},{"login",0,action,0,0,0,napi_default,(void *)1},{"reload",0,action,0,0,0,napi_default,(void *)2},{"release",0,action,0,0,0,napi_default,(void *)3}};
 napi_define_properties(env,exports,6,properties);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,initialize)
