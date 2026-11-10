/* Content stays in the HTML for accessibility, indexing, and use without JavaScript. */
const translations = {
  zh: {
    skip:'跳至正文',navigation:'主导航','nav.work':'作品','nav.about':'关于','nav.experience':'经历','nav.contact':'联系',
    'hero.name':'张恒','hero.alias':'无理造物 WoooLAB','hero.heading':'电子硬件、嵌入式系统<br>与开源开发。','hero.description':'在电路与代码之间工作。从一块电路板到一套交互框架，关注系统如何设计、实现，并在真实硬件上运行。','hero.phd':'香港科技大学（广州）· ROAS 博士生','hero.intern':'强脑科技 BrainCo · 电子硬件工程师（实习）','hero.cta':'浏览代表作品','hero.caption':'从硬件到交互，完整构建。','hero.fields':'电路设计 / 固件开发 / 人机交互',
    'work.title':'让作品说话。','work.intro':'开源软件、开发工具与硬件。<br>从个人需求出发，向社区开放。','work.metrics':'仓库数据核对于 2026.11，实时数据以 GitHub 为准。','work.all':'全部开源项目',
    'ui.subtitle':'小屏幕，也有完整的交互体验。','ui.description':'面向 OLED 的 C++ UI 框架，以树结构管理多级菜单，提供平滑动画与可扩展的组件，让资源有限的设备也能拥有细腻的操作体验。',
    'lite.description':'纯 C 实现的轻量级 OLED / LCD UI 框架。无外部依赖，支持多种屏幕，保留平滑交互，也让移植与定制更加直接。',
    'launcher.description':'搭载 astra UI Lite 的 STM32 HMI 开发板。将自制硬件、固件和屏幕交互整合到一块紧凑的开发平台中。',
    'library.description':'在实际硬件开发中积累和维护的 Altium Designer 原理图与 PCB 封装库。将重复的设计工作沉淀为可复用的工具。','library.cta':'浏览封装库','link.source':'查看源码','link.demo':'观看演示',
    'about.title':'从原理出发，<br>在实践中理解。','about.name':'AstraThreshold / 张恒','about.lead':'我是张恒，也以 AstraThreshold 和「无理造物 WoooLAB」的名字分享作品。目前在香港科技大学（广州）机器人与自主系统（ROAS）专业攻读博士，并在强脑科技担任电子硬件工程师实习生。','about.body':'我的主要实践围绕电子硬件、嵌入式系统与控制展开：设计电路和 PCB，编写底层固件，再将它们连接成可以实际使用的系统。我也持续探索相机、成像与光学，把对摄影的兴趣延伸到设备本身。','about.community':'开源与分享是这段实践的一部分。我在 GitHub 维护项目，也在哔哩哔哩记录制作过程、技术细节和经验。',
    'expertise.hardware':'电子硬件设计','expertise.hardware.detail':'原理图 · PCB Layout · 电源与驱动','expertise.firmware':'嵌入式系统','expertise.exploration':'相机与成像','expertise.exploration.detail':'光机电系统 · 取景交互 · 原型开发',
    'current.category':'相机、光学与嵌入式系统的交汇。','current.status':'在研项目 / In development','current.description':'围绕即时成像相机展开的个人项目，探索光学取景、信息叠加与电子控制的结合。目前持续推进光路、机械结构和显示驱动的设计与验证。','current.note':'从系统约束到原型，让硬件、光路与交互逐步协同。',
    'experience.title':'持续积累，向前探索。','experience.phd.date':'2026 — 至今','experience.phd.title':'香港科技大学（广州）','experience.phd.detail':'机器人与自主系统（ROAS）· 博士研究生','experience.brainco.date':'2025 — 至今','experience.brainco.title':'强脑科技 BrainCo','experience.brainco.detail':'电子硬件工程师 · 实习','experience.bjut.title':'北京工业大学','experience.bjut.detail':'机器人工程 · 本科','experience.education.title':'机器人教育与竞赛指导','experience.education.detail':'RoboMaster、VEX、嵌入式创意项目与编程教学',
    'recognition.title':'第十五届蓝桥杯','recognition.award':'电子赛国赛一等奖','recognition.rank':'全国第十','recognition.cert1':'工业互联网嵌入式开发工程师（中级）','recognition.cert2':'PCB 设计（初级）','recognition.camp':'DJI RoboMaster 机器人营往期营员',
    'contact.title':'交流，从这里开始。','contact.description':'关于硬件、开源项目，或一个值得动手的想法。','contact.bili':'哔哩哔哩','contact.bili.name':'无理造物 WoooLAB','footer.top':'回到顶部',
    'image.launcher':'astra launcher STM32 HMI 开发板实拍，OLED 显示运行中的界面','image.ui':'OLED 屏幕上运行的 astra UI 启动画面','image.lite':'运行 astra UI Lite 的 OLED 与开发板实拍'
  },
  en: {
    skip:'Skip to content',navigation:'Main navigation','nav.work':'Work','nav.about':'About','nav.experience':'Experience','nav.contact':'Contact',
    'hero.name':'Heng Zhang','hero.alias':'WoooLAB','hero.heading':'Electronic hardware.<br>Embedded systems.<br>Open source.','hero.description':'Working between circuits and code. From a circuit board to a UI framework, I design and build systems that run on real hardware.','hero.phd':'PhD student · ROAS · HKUST(GZ)','hero.intern':'Electronic Hardware Engineer Intern · BrainCo','hero.cta':'Explore selected work','hero.caption':'Built from hardware to interaction.','hero.fields':'CIRCUIT DESIGN / FIRMWARE / HUMAN–MACHINE INTERFACES',
    'work.title':'Built. Shared. Open.','work.intro':'Software, development tools, and hardware.<br>Built for a purpose. Shared with the community.','work.metrics':'Repository figures checked in Nov 2026. See GitHub for current counts.','work.all':'All repositories',
    'ui.subtitle':'Thoughtful interaction on a small display.','ui.description':'A C++ UI framework for OLED displays. Tree-based menu management, smooth animations, and extensible components bring a refined interface to resource-constrained devices.',
    'lite.description':'A lightweight OLED / LCD UI framework written in pure C. No external dependencies, broad display support, and smooth interaction, designed for straightforward porting and customization.',
    'launcher.description':'A compact STM32 HMI development board running astra UI Lite. Custom hardware, firmware, and display interaction brought together in one platform.',
    'library.description':'An Altium Designer schematic and PCB footprint library maintained through hands-on hardware development. Turning recurring design work into reusable tools.','library.cta':'Explore the library','link.source':'View source','link.demo':'Watch demo',
    'about.title':'Start with principles.<br>Learn by building.','about.name':'AstraThreshold / Heng Zhang','about.lead':'I am Heng Zhang, sharing my work as AstraThreshold and WoooLAB. I am a PhD student in Robotics and Autonomous Systems (ROAS) at HKUST(GZ), and an Electronic Hardware Engineer Intern at BrainCo.','about.body':'My work centers on electronic hardware, embedded systems, and control: designing circuits and PCBs, writing firmware, and bringing them together as working systems. I also explore cameras, imaging, and optics, extending an interest in photography to the devices themselves.','about.community':'Open source and knowledge sharing are part of that practice. I maintain projects on GitHub and document builds, technical details, and lessons on Bilibili.',
    'expertise.hardware':'Electronic hardware','expertise.hardware.detail':'Schematics · PCB layout · Power & drives','expertise.firmware':'Embedded systems','expertise.exploration':'Cameras & imaging','expertise.exploration.detail':'Optomechatronics · Viewfinders · Prototyping',
    'current.category':'Where cameras, optics, and embedded systems meet.','current.status':'In development','current.description':'A personal instant-camera project exploring optical viewfinding, information overlays, and electronic control. Ongoing work includes the design and validation of optical paths, mechanical structures, and display drivers.','current.note':'Bringing hardware, optics, and interaction together, one prototype at a time.',
    'experience.title':'A practice in progress.','experience.phd.date':'2026 — Present','experience.phd.title':'HKUST (Guangzhou)','experience.phd.detail':'PhD student · Robotics and Autonomous Systems (ROAS)','experience.brainco.date':'2025 — Present','experience.brainco.title':'BrainCo','experience.brainco.detail':'Electronic Hardware Engineer · Internship','experience.bjut.title':'Beijing University of Technology','experience.bjut.detail':'Undergraduate · Robotics Engineering','experience.education.title':'Robotics education & competition coaching','experience.education.detail':'RoboMaster, VEX, embedded projects, and programming',
    'recognition.title':'15th Lanqiao Cup','recognition.award':'National First Prize · Electronics','recognition.rank':'10th nationwide','recognition.cert1':'Industrial IoT Embedded Development Engineer · Intermediate','recognition.cert2':'PCB Design · Junior','recognition.camp':'DJI RoboMaster Robotics Camp alumnus',
    'contact.title':'Start a conversation.','contact.description':'About hardware, open source, or an idea worth building.','contact.bili':'Bilibili','contact.bili.name':'WoooLAB','footer.top':'Back to top',
    'image.launcher':'Photograph of the astra launcher STM32 HMI board with its OLED interface running','image.ui':'The astra UI boot screen running on an OLED display','image.lite':'Photograph of an OLED and development board running astra UI Lite'
  }
};

function setLanguage(language) {
  const locale = language === 'en' ? 'en' : 'zh';
  const dictionary = translations[locale];
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = dictionary[element.dataset.i18n];
    if (value === undefined) return;
    // Only these trusted, local translations contain markup (line breaks).
    element.replaceChildren(...value.split('<br>').flatMap((text, index) => index ? [document.createElement('br'), document.createTextNode(text)] : [document.createTextNode(text)]));
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(element => { element.alt = dictionary[element.dataset.i18nAlt]; });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', dictionary[element.dataset.i18nAria]); });
  document.querySelectorAll('[data-language]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.language === locale)); });
  document.querySelector('meta[name="description"]').content = locale === 'en' ? 'AstraThreshold: electronic hardware, embedded systems, and open source. ROAS PhD student at HKUST(GZ) and Electronic Hardware Engineer Intern at BrainCo.' : 'AstraThreshold 的个人主页。港科广 ROAS 博士生、电子硬件工程师，关注嵌入式系统、硬件设计与开源开发。';
  try { localStorage.setItem('wooolab-language', locale); } catch { /* The switch also works when storage is unavailable. */ }
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
let initialLanguage;
try { initialLanguage = localStorage.getItem('wooolab-language'); } catch { /* Use the visitor's locale. */ }
if (!['zh', 'en'].includes(initialLanguage)) initialLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
setLanguage(initialLanguage);
