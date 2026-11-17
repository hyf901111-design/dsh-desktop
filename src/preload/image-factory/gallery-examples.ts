type Copy = readonly [zh: string, en: string]
type GalleryExample = {
  id: string
  title: Copy
  prompt: Copy
  scenes: Copy
}

export const galleryExamples: GalleryExample[] = [
  {
    id: 'lantern-fox', title: ['提灯的狐狸', 'The lantern fox'],
    scenes: ['绘本封面 · 故事插画', 'Book covers · Story illustrations'],
    prompt: [
      '绘制一张儿童绘本封面。穿宽大棕色大衣的小狐狸提着暖黄色纸灯笼，在深蓝的傍晚树林里缓慢往前走。用温柔的水粉笔触和纸张颗粒表现衣料、树影和被照亮的路面。保留上下留白，不写文字。',
      'Paint a picture-book cover of a small fox in an oversized brown coat walking through a cobalt forest with a glowing paper lantern. Use tactile gouache strokes and warm light on the path. Leave space above and below, with no lettering.',
    ],
  },
  {
    id: 'ridge-walk', title: ['山脊徒步', 'Ridge walk'],
    scenes: ['旅行封面 · 专题配图', 'Travel covers · Editorial imagery'],
    prompt: [
      '制作一张旅行封面图。穿黄色外套的徒步者独自走在翠绿山脊，面向层层云雾包裹的群山。视角略俯拍，用蜿蜒的小径做引导线，阴天自然光，保留衣服和草地的明暗反差，画面无需文字。',
      'Create a travel cover showing a lone hiker in a yellow jacket on an emerald ridge facing layers of foggy mountains. Shoot from a slightly elevated angle and use the winding path as a leading line. Natural cloudy light and no text.',
    ],
  },
  {
    // Jimeng public work 7620360326730550574. Original direction adapted for an unbranded product.
    id: 'olive-perfume', title: ['橄榄绿香氛', 'Olive perfume'],
    scenes: ['品牌提案 · 商品视觉', 'Brand concepts · Product imagery'],
    prompt: [
      '拍摄一张有暖调复古质感的香水静物。无标识的透明橄榄绿玻璃瓶直立于深绿镜面台上，点缀几簇白茉莉。暖黄侧后光从右侧落下，保留瓶身的通透感、细小高光和自然倒影。背景用深浅渐变的哑光橄榄绿。',
      'Photograph an unbranded olive-glass perfume bottle on a dark reflective green surface with a few white jasmine blossoms. Use warm side-back light, subtle glass highlights, a real reflection and a matte olive gradient.',
    ],
  },
  {
    id: 'blue-hour', title: ['雨夜街角', 'Rain after dark'],
    scenes: ['电影感封面 · 社交内容', 'Cinematic covers · Social content'],
    prompt: [
      '做一张电影感的城市夜景封面。一个骑车的人穿过刚下过雨的街角，霓虹倒映在湿润路面。以蓝紫为主色，一束逆光勾出雨丝和人物外形，留出较暗的空间可排标题。不要品牌招牌或可辨认文字。',
      'Make a cinematic city-night cover. A cyclist crosses a rain-soaked corner with neon reflections on the street. Use a blue-violet palette and backlight the rain and silhouette. Leave dark space for a title. No visible brands or readable signs.',
    ],
  },
  {
    id: 'flower-market', title: ['周末花市', 'Weekend flower market'],
    scenes: ['活动海报 · 市集宣传', 'Event posters · Market promotions'],
    prompt: [
      '为周末花市做一张复古印刷风的海报。用暖白色纤维纸作背景，画面中央摆放一束橘红郁金香，加入大面积朱红色块。上方用深色衬线字写「FLOWER MARKET」，只保留这行文字，四周留出安全边距。',
      'Make a vintage print poster for a weekend flower market. Center orange-red tulips on warm textured paper and use bold vermilion accents. Set the only text, “FLOWER MARKET”, in a dark serif near the top. Leave generous margins.',
    ],
  },
  {
    // Jimeng public work 7653480771084176649. A plain-language prompt for a new illustration.
    id: 'jiangnan', title: ['烟雨江南', 'Misty Jiangnan'],
    scenes: ['文化活动 · 国风插画', 'Cultural events · Chinese-style illustrations'],
    prompt: [
      '画一张国风水彩电影海报插画。清晨薄雾沿水面散开，江南园林的一座亭子映在湖里，春日桃花从上方伸入画面。用青绿、奶白和一点粉，保留宣纸淡彩晕染质感，瓦片用细线勾画，远山轻轻晕染。留白，不加文字。',
      'Paint a Chinese garden pavilion reflected in a lake as morning mist lifts. Frame it with spring peach branches. Use a cool celadon and cream palette, textured paper, fine roof detail and loose washes for distant hills. No text.',
    ],
  },
  {
    // Jimeng public work 7651176999834225958. Seasonal still-life brief adapted to a new layout.
    id: 'summer-fruit', title: ['夏日果盘', 'Summer fruit'],
    scenes: ['食品摄影 · 时令宣传', 'Food photography · Seasonal campaigns'],
    prompt: [
      '做一幅夏日静物摄影。竹编浅篮里放带水珠的水蜜桃、枇杷和红樱桃，旁景配一壶茶和几片荷叶。以深棕木桌和虚化的翠绿植物衬托果实，用明亮柔和的侧自然光照出真实果皮纹理。保持画面清爽干净。',
      'Photograph dew-covered peaches, loquats and cherries in a shallow bamboo basket with a teapot and lotus leaves nearby. Use a dark wooden table, a soft green background and bright side light to reveal the fruit textures.',
    ],
  },
  {
    // Jimeng public work 7655210951083478281. Reimagined without third-party lettering or signatures.
    id: 'creative-drop', title: ['灵感补给站', 'Creative drop'],
    scenes: ['活动主视觉 · 社交封面', 'Event visuals · Social covers'],
    prompt: [
      '设计一张创意活动主视觉，电光蓝渐变背景上漂浮半透明手机、卡片、气泡和小立方体。用果冻亚克力、磨砂塑料、珠光和亮绿色点缀。元素集中在中间，顶部留出版面，适合后续添加标题。不要文字、商标或水印。',
      'Design an event visual with a translucent handset, cards, bubbles and small cubes floating against electric blue. Mix jelly acrylic, matte plastic, pearl and lime accents. Keep the top open for a future heading. No text or logos.',
    ],
  },
  {
    // Jimeng public work 7605013968486141235. A new coastal architecture concept in the same category.
    id: 'coastal-museum', title: ['海边美术馆', 'Coastal museum'],
    scenes: ['建筑专栏 · 杂志封面', 'Architecture features · Magazine covers'],
    prompt: [
      '生成一张建筑杂志封面图。海边美术馆像一条银沙色缎带从海岸上舒展，弧线串起步道和观景平台。黄昏的暖光照亮外墙，远处海面与淡紫天空相接。左上留出可排标题的区域。',
      'Create an architecture cover image. A silver-sand museum unspools along the coast like a ribbon, with curved walkways and terraces. Set it against a lilac dusk sky and warm low-angle light. Leave room for a heading in the upper left.',
    ],
  },
  {
    id: 'night-shift', title: ['夜行音乐节', 'Night Shift'],
    scenes: ['演出海报 · 音乐节宣传', 'Gig posters · Festival promotions'],
    prompt: [
      '设计一张地下音乐节海报。黑胶唱片占据画面中央，品红与橙光照亮唱片沟槽，背景是带细颗粒的近黑色。用超大无衬线体写「NIGHT SHIFT」，保持一眼可读，除此之外不要加入文字。',
      'Design an underground music festival poster around a black vinyl record with magenta and orange light revealing its grooves. Use a textured near-black backdrop and large readable sans-serif type. The only text is “NIGHT SHIFT”.',
    ],
  },
  {
    // Jimeng public work 7621360951765388571. Original category and material direction.
    id: 'liquid-silver', title: ['液态银护肤', 'Liquid silver'],
    scenes: ['护肤品牌 · 商品广告', 'Skin care branding · Product ads'],
    prompt: [
      '拍摄一张冷色调的无品牌护肤品广告。中央摆一支带淡紫饰带的银色金属瓶，置于液态金属感反光台面。几滴透明水珠跃起，在台面留下波纹和倒影。灰白背景以柔光过渡，用精细局部高光强调瓶身材质。',
      'Photograph an unbranded silver skincare bottle with a subtle lavender band on a reflective liquid-metal plinth. Catch a few drops and ripples against a soft gray background. Use cool diffused light and crisp controlled highlights.',
    ],
  },
  {
    id: 'blood-orange', title: ['血橙特写', 'Blood orange'],
    scenes: ['饮品推广 · 商品配图', 'Beverage campaigns · Product imagery'],
    prompt: [
      '做一张有强烈配色的产品摄影。把刚切开的血橙薄片定格在空中，以青蓝色纯净背景衬托鲜红果肉。硬光照亮果汁和果皮细节，构图轻盈但重心明确，适合用作饮品推广图。不加文案。',
      'Create a product photograph of freshly sliced blood oranges suspended in midair against a clean teal background. Use crisp light to reveal the ruby pulp and juice droplets. Keep the composition airy and suitable for a beverage campaign. No text.',
    ],
  },
]
