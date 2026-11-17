import type { GalleryExample } from './gallery-examples'

export type EnterpriseLayout = 'invitation' | 'screen' | 'schedule' | 'profile' | 'countdown' | 'story' |
  'split' | 'features' | 'social' | 'audio' | 'cover' | 'notice' | 'certificate' | 'sign' | 'metric' | 'timeline'
export type EnterpriseTone = 'navy' | 'teal' | 'violet' | 'terra' | 'slate'
export type GalleryCategory = 'brand' | 'events' | 'social' | 'team' | 'operations' | 'report'
export type EnterpriseTemplate = {
  category: GalleryCategory
  layout: EnterpriseLayout
  tone: EnterpriseTone
  width: number
  height: number
  photo?: string
  details: readonly (readonly [string, string])[]
}

export const enterpriseGalleryExamples: GalleryExample[] = [
  {
    id: "meeting-invitation", title: ["诚邀出席","You're invited"], material: ["会议邀请函","Meeting invitation"], format: "4:5",
    subtitle: ["企业交流会议","Corporate roundtable"],
    enterprise: { category: 'events', layout: 'invitation', tone: 'navy', width: 960, height: 1200, photo: 'glass-boardroom',
      details: [["日期与时间","Date and time"], ["会议地点","Location"], ["请于指定日期前回复","RSVP by the stated date"]] },
  },
  {
    id: "summit-checkin", title: ["峰会签到","Summit check-in"], material: ["峰会签到背景","Summit check-in backdrop"], format: "3:1",
    subtitle: ["欢迎各位嘉宾","Welcome, distinguished guests"],
    enterprise: { category: 'events', layout: 'screen', tone: 'navy', width: 1440, height: 480, photo: 'conference-light',
      details: [["请在入口完成签到","Check in at the entrance"]] },
  },
  {
    id: "conference-agenda", title: ["会议议程","Conference agenda"], material: ["会议议程单","Conference programme"], format: "A4",
    subtitle: ["请按活动实际安排填写","Adapt the programme to your event"],
    enterprise: { category: 'events', layout: 'schedule', tone: 'teal', width: 840, height: 1188,
      details: [["09:00 嘉宾签到","09:00 Check-in"], ["09:30 主题分享","09:30 Keynote"], ["10:30 圆桌交流","10:30 Panel discussion"], ["11:30 自由交流","11:30 Networking"]] },
  },
  {
    id: "speaker-profile", title: ["主题演讲嘉宾","Speaker spotlight"], material: ["嘉宾介绍海报","Speaker profile"], format: "4:5",
    subtitle: ["填写嘉宾姓名与职务","Add the speaker’s name and title"],
    enterprise: { category: 'events', layout: 'profile', tone: 'violet', width: 960, height: 1200, photo: 'portrait-pro',
      details: [["主题演讲","Keynote"], ["填写分享主题","Add the talk title"]] },
  },
  {
    id: "event-countdown", title: ["活动即将开始","Event countdown"], material: ["活动倒计时海报","Countdown poster"], format: "1:1",
    subtitle: ["预留日期和报名入口","Add the date and registration link"],
    enterprise: { category: 'events', layout: 'countdown', tone: 'violet', width: 960, height: 960, photo: 'paper-cobalt',
      details: [["03","03"], ["天后见","Days to go"]] },
  },
  {
    id: "event-recap", title: ["精彩回顾","Event highlights"], material: ["活动回顾长图","Event recap"], format: "1:2",
    subtitle: ["记录交流、发现与下一步","Capture the discussion and what comes next"],
    enterprise: { category: 'events', layout: 'story', tone: 'teal', width: 720, height: 1440, photo: 'conference-light',
      details: [["活动现场","On the day"], ["交流亮点","Discussion highlights"], ["后续安排","What’s next"]] },
  },
  {
    id: "webinar-promo", title: ["线上研讨会","Join our webinar"], material: ["线上研讨会预告","Webinar promotion"], format: "16:9",
    subtitle: ["分享观点，交流实践","Exchange ideas and practical insights"],
    enterprise: { category: 'events', layout: 'split', tone: 'navy', width: 1280, height: 720, photo: 'workshop-table',
      details: [["填写时间","Add a date and time"], ["线上报名","Register online"]] },
  },
  {
    id: "launch-key-visual", title: ["新品发布","Product launch"], material: ["新品发布主视觉","Product launch visual"], format: "16:9",
    subtitle: ["预留产品名称与核心卖点","Add a product name and key benefit"],
    enterprise: { category: 'brand', layout: 'split', tone: 'slate', width: 1280, height: 720, photo: 'industrial-lab',
      details: [["发布信息","Launch information"]] },
  },
  {
    id: "service-onepage", title: ["服务亮点","Service highlights"], material: ["服务介绍单页","Service one-pager"], format: "A4",
    subtitle: ["用一页讲清服务能带来的价值","Describe the service and its value"],
    enterprise: { category: 'brand', layout: 'features', tone: 'teal', width: 840, height: 1188, photo: 'glass-boardroom',
      details: [["服务范围","Scope"], ["交付方式","Delivery"], ["联系团队","Contact"]] },
  },
  {
    id: "brand-story", title: ["从愿景到行动","From vision to action"], material: ["品牌故事海报","Brand story poster"], format: "3:4",
    subtitle: ["写下品牌为什么出发","Tell the story behind the brand"],
    enterprise: { category: 'brand', layout: 'profile', tone: 'navy', width: 900, height: 1200, photo: 'steady-horizon',
      details: [["品牌故事","Brand story"], ["补充行动或实践","Describe the work"]] },
  },
  {
    id: "visitor-welcome", title: ["欢迎来访","Welcome"], material: ["访客欢迎屏","Visitor welcome screen"], format: "16:9",
    subtitle: ["预留来访机构与嘉宾姓名","Add the organisation and guest name"],
    enterprise: { category: 'brand', layout: 'screen', tone: 'teal', width: 1280, height: 720, photo: 'welcome-hall',
      details: [["来访日期与接待安排","Date and reception details"]] },
  },
  {
    id: "partner-recruit", title: ["与伙伴同行","Partner with us"], material: ["合作伙伴招募海报","Partner recruitment poster"], format: "4:5",
    subtitle: ["寻找共同推进项目的伙伴","Find partners for your next project"],
    enterprise: { category: 'brand', layout: 'invitation', tone: 'navy', width: 960, height: 1200, photo: 'blueprint-city',
      details: [["合作方向","Opportunity"], ["参与条件","Requirements"], ["联络方式","Contact"]] },
  },
  {
    id: "social-announcement", title: ["发布一则动态","Company update"], material: ["社交媒体横推","Social announcement banner"], format: "2:1",
    subtitle: ["用一句话说清楚新进展","Describe the news in one sentence"],
    enterprise: { category: 'social', layout: 'split', tone: 'violet', width: 1200, height: 600, photo: 'city-lighttrails',
      details: [["企业动态","Company news"]] },
  },
  {
    id: "social-update", title: ["一张图讲明白","One idea in one card"], material: ["社交媒体方图","Social square card"], format: "1:1",
    subtitle: ["把核心信息放在这里","Put the main message here"],
    enterprise: { category: 'social', layout: 'social', tone: 'teal', width: 960, height: 960, photo: 'craft',
      details: [["补充一句阅读提示","Add a short reading note"]] },
  },
  {
    id: "livestream-story", title: ["直播预告","Live stream preview"], material: ["直播间竖版预告","Vertical live stream preview"], format: "9:16",
    subtitle: ["填写主题、时间及参与方式","Add the topic, time and how to join"],
    enterprise: { category: 'social', layout: 'profile', tone: 'violet', width: 720, height: 1280, photo: 'conference-light',
      details: [["即将直播","Going live"], ["日期与时间","Date and time"]] },
  },
  {
    id: "seasonal-story", title: ["佳节问候","Seasonal greetings"], material: ["节日手机祝福图","Seasonal greeting story"], format: "9:16",
    subtitle: ["写一段真诚的节日祝福","Add a warm seasonal message"],
    enterprise: { category: 'social', layout: 'profile', tone: 'terra', width: 720, height: 1280, photo: 'new-year-light',
      details: [["节日问候","Season’s greetings"], ["填写落款","Add your sign-off"]] },
  },
  {
    id: "podcast-cover", title: ["在工作现场","At work"], material: ["企业播客封面","Company podcast cover"], format: "1:1",
    subtitle: ["用声音分享行业与实践","Conversations about industry and practice"],
    enterprise: { category: 'social', layout: 'audio', tone: 'violet', width: 960, height: 960, photo: 'podcast-booth',
      details: [["第 01 期","Episode 01"]] },
  },
  {
    id: "internal-magazine", title: ["团队季刊","Team journal"], material: ["企业内刊封面","Internal magazine cover"], format: "A4",
    subtitle: ["记录团队工作与共同成长","Stories of work and growth"],
    enterprise: { category: 'team', layout: 'cover', tone: 'teal', width: 840, height: 1188, photo: 'research-desk',
      details: [["本期主题","In this issue"], ["季度及期号","Quarter and issue"]] },
  },
  {
    id: "talent-recruit", title: ["加入我们的团队","Join our team"], material: ["企业招聘海报","Recruitment poster"], format: "4:5",
    subtitle: ["填写招聘职位与申请方式","Add the role and how to apply"],
    enterprise: { category: 'team', layout: 'invitation', tone: 'navy', width: 960, height: 1200, photo: 'portrait-pro',
      details: [["在招职位","Open roles"], ["工作地点","Location"], ["申请方式","How to apply"]] },
  },
  {
    id: "employee-welcome", title: ["欢迎加入","Welcome aboard"], material: ["新员工欢迎卡","New employee welcome card"], format: "4:3",
    subtitle: ["填写同事姓名与所属团队","Add the colleague’s name and team"],
    enterprise: { category: 'team', layout: 'split', tone: 'terra', width: 1040, height: 780, photo: 'workshop-table',
      details: [["期待与你共事","We’re glad you’re here"]] },
  },
  {
    id: "training-plan", title: ["培训课程安排","Training schedule"], material: ["企业培训课程表","Training schedule"], format: "A4",
    subtitle: ["填写课程主题与参训对象","Add the topic and audience"],
    enterprise: { category: 'team', layout: 'schedule', tone: 'navy', width: 840, height: 1188,
      details: [["第一节 课程导入","Session 1 Introduction"], ["第二节 案例演练","Session 2 Case study"], ["第三节 实践交流","Session 3 Practice"], ["课后 作业与反馈","After class Feedback"]] },
  },
  {
    id: "internal-notice", title: ["团队通知","Team notice"], material: ["内部通知海报","Internal notice"], format: "3:4",
    subtitle: ["填写通知摘要与生效日期","Add a summary and effective date"],
    enterprise: { category: 'team', layout: 'notice', tone: 'slate', width: 900, height: 1200,
      details: [["通知事项","Announcement"], ["适用范围","Who it applies to"], ["联系人","Contact"]] },
  },
  {
    id: "recognition-award", title: ["员工表彰证书","Certificate of recognition"], material: ["员工表彰证书","Recognition certificate"], format: "A4 横版",
    subtitle: ["谨以此证感谢你的杰出贡献","With appreciation for your contribution"],
    enterprise: { category: 'team', layout: 'certificate', tone: 'terra', width: 1188, height: 840,
      details: [["填写获奖人姓名","Recipient name"], ["填写授予单位","Issuing organisation"], ["颁发日期","Date"]] },
  },
  {
    id: "office-wayfinding", title: ["会议区","Meeting rooms"], material: ["办公室导视牌","Office wayfinding sign"], format: "5:2",
    subtitle: ["填写楼层号、空间名或方向","Add the floor, room or direction"],
    enterprise: { category: 'operations', layout: 'sign', tone: 'teal', width: 1200, height: 480,
      details: [["访客请先登记","Visitors: please check in"]] },
  },
  {
    id: "quarterly-brief", title: ["季度业务简报","Quarterly business brief"], material: ["季度业务简报封面","Quarterly brief cover"], format: "16:9",
    subtitle: ["用关键指标和行动概览本季度","Summarise the quarter in metrics and actions"],
    enterprise: { category: 'report', layout: 'metric', tone: 'navy', width: 1280, height: 720, photo: 'city-lighttrails',
      details: [["关键指标","Key metric"], ["阶段成果","Milestone"], ["下步行动","Next action"]] },
  },
  {
    id: "esg-cover", title: ["可持续发展专题","Sustainability in focus"], material: ["ESG 专题封面","Sustainability cover"], format: "A4",
    subtitle: ["填写专题名称与报告期间","Add the theme and reporting period"],
    enterprise: { category: 'report', layout: 'cover', tone: 'teal', width: 840, height: 1188, photo: 'forest-grid',
      details: [["专题报告","Special report"], ["报告期","Reporting period"]] },
  },
  {
    id: "research-cover", title: ["研究报告","Research report"], material: ["研究报告封面","Research report cover"], format: "A4",
    subtitle: ["填写研究议题与作者","Add the research topic and authors"],
    enterprise: { category: 'report', layout: 'cover', tone: 'slate', width: 840, height: 1188, photo: 'paper-cobalt',
      details: [["研究主题","Research topic"], ["完成日期","Date"]] },
  },
  {
    id: "case-overview", title: ["项目案例速览","Project case study"], material: ["项目案例速览","Case study overview"], format: "16:9",
    subtitle: ["交代目标、做法和结果","Summarise the goal, approach and outcome"],
    enterprise: { category: 'operations', layout: 'metric', tone: 'teal', width: 1280, height: 720, photo: 'industrial-lab',
      details: [["项目背景","Context"], ["解决思路","Approach"], ["关键结果","Outcome"]] },
  },
  {
    id: "insight-card", title: ["读懂一个指标","Understand one metric"], material: ["数据洞察卡","Data insight card"], format: "1:1",
    subtitle: ["先写结论，再补充口径和来源","Start with the finding, then give context"],
    enterprise: { category: 'report', layout: 'social', tone: 'navy', width: 960, height: 960, photo: 'craft',
      details: [["数据口径与来源","Definition and source"]] },
  },
  {
    id: "year-milestones", title: ["年度里程碑","Annual milestones"], material: ["年度里程碑长图","Annual milestone timeline"], format: "1:2",
    subtitle: ["按时间梳理关键节点","Put the year’s milestones in order"],
    enterprise: { category: 'operations', layout: 'timeline', tone: 'violet', width: 720, height: 1440, photo: 'city-lighttrails',
      details: [["第一季度 启动","Q1 Kick-off"], ["第二季度 推进","Q2 Delivery"], ["第三季度 验证","Q3 Validation"], ["第四季度 复盘","Q4 Review"]] },
  },
]
