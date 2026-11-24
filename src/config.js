// ============================================================
// 频道清单与上游源配置
// ============================================================

// ---------- 上游公开直播源（可自行增删，注意免费版单次请求 50 个子请求上限）----------
export const SOURCES = [
  { name: 'suxuang',     url: 'https://raw.githubusercontent.com/suxuang/myIPTV/main/ipv4.m3u' },
  { name: 'Guovin',      url: 'https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u' },
  { name: 'fanmingming', url: 'https://live.fanmingming.com/tv/m3u/global.m3u' },
  { name: 'vbskycn',     url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u' },
  { name: 'iptv-org',    url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  { name: 'YueChan',     url: 'https://raw.githubusercontent.com/YueChan/Live/main/IPTV.m3u' },
];

// ---------- 央视频道（group: 央视）----------
export const CCTV_CHANNELS = [
  { key: 'CCTV-1',   name: 'CCTV-1 综合' },
  { key: 'CCTV-2',   name: 'CCTV-2 财经' },
  { key: 'CCTV-3',   name: 'CCTV-3 综艺' },
  { key: 'CCTV-4',   name: 'CCTV-4 中文国际' },
  { key: 'CCTV-5',   name: 'CCTV-5 体育' },
  { key: 'CCTV-5+',  name: 'CCTV-5+ 体育赛事' },
  { key: 'CCTV-6',   name: 'CCTV-6 电影' },
  { key: 'CCTV-7',   name: 'CCTV-7 国防军事' },
  { key: 'CCTV-8',   name: 'CCTV-8 电视剧' },
  { key: 'CCTV-9',   name: 'CCTV-9 纪录' },
  { key: 'CCTV-10',  name: 'CCTV-10 科教' },
  { key: 'CCTV-11',  name: 'CCTV-11 戏曲' },
  { key: 'CCTV-12',  name: 'CCTV-12 社会与法' },
  { key: 'CCTV-13',  name: 'CCTV-13 新闻' },
  { key: 'CCTV-14',  name: 'CCTV-14 少儿' },
  { key: 'CCTV-15',  name: 'CCTV-15 音乐' },
  { key: 'CCTV-16',  name: 'CCTV-16 奥林匹克' },
  { key: 'CCTV-17',  name: 'CCTV-17 农业农村' },
  { key: 'CCTV-4K',  name: 'CCTV-4K 超高清' },
  { key: 'CCTV-8K',  name: 'CCTV-8K 超高清' },
];

// ---------- CGTN（归入央视组）----------
export const CGTN_CHANNELS = [
  { key: 'CGTN-EN',   name: 'CGTN 英语' },
  { key: 'CGTN-DOC',  name: 'CGTN 纪录' },
  { key: 'CGTN-ES',   name: 'CGTN 西语' },
  { key: 'CGTN-FR',   name: 'CGTN 法语' },
  { key: 'CGTN-RU',   name: 'CGTN 俄语' },
  { key: 'CGTN-AR',   name: 'CGTN 阿语' },
];

// ---------- 省级卫视（group: 卫视）----------
export const SATELLITE_CHANNELS = [
  '北京卫视', '东方卫视', '湖南卫视', '浙江卫视', '江苏卫视', '广东卫视', '深圳卫视',
  '山东卫视', '安徽卫视', '天津卫视', '重庆卫视', '四川卫视', '湖北卫视', '河南卫视',
  '河北卫视', '山西卫视', '辽宁卫视', '吉林卫视', '黑龙江卫视', '内蒙古卫视',
  '云南卫视', '贵州卫视', '广西卫视', '海南卫视', '东南卫视', '海峡卫视',
  '江西卫视', '陕西卫视', '甘肃卫视', '青海卫视', '宁夏卫视', '新疆卫视', '西藏卫视',
  '兵团卫视', '三沙卫视', '厦门卫视', '大湾区卫视', '延边卫视', '安多卫视',
];

// 卫视别名（常见旧称/俗称 → 标准名）
export const SATELLITE_ALIASES = {
  '上海卫视': '东方卫视',
  '旅游卫视': '海南卫视',
  '福建东南': '东南卫视',
  '福建海峡': '海峡卫视',
};

// iptv-org 等国际源的英文频道命名（归一化大写、已剥 SATELLITE 后缀）→ 标准名
export const SATELLITE_EN_ALIASES = {
  'BEIJINGTV': '北京卫视', 'ANHUITV': '安徽卫视', 'BINGTUANTV': '兵团卫视',
  'GANSUTV': '甘肃卫视', 'GUANGDONGTV': '广东卫视', 'GUANGXITV': '广西卫视',
  'GUIZHOUTV': '贵州卫视', 'HAINANTV': '海南卫视', 'HEBEITV': '河北卫视',
  'HEILONGJIANGTV': '黑龙江卫视', 'HENANTV': '河南卫视', 'HUBEITV': '湖北卫视',
  'JILINTV': '吉林卫视', 'JIANGSUTV': '江苏卫视', 'JIANGXITV': '江西卫视',
  'LIAONINGTV': '辽宁卫视', 'NEIMENGGUTV': '内蒙古卫视', 'INNERMONGOLIATV': '内蒙古卫视',
  'NINGXIATV': '宁夏卫视', 'QINGHAITV': '青海卫视', 'SHANDONGTV': '山东卫视',
  'SHANXITV': '山西卫视', 'SHAANXITV': '陕西卫视', 'SHENZHENTV': '深圳卫视',
  'SICHUANTV': '四川卫视', 'TIANJINTV': '天津卫视', 'TIBETTV': '西藏卫视',
  'XIZANGTV': '西藏卫视', 'XINJIANGTV': '新疆卫视', 'YUNNANTV': '云南卫视',
  'ZHEJIANGTV': '浙江卫视', 'CHONGQINGTV': '重庆卫视', 'HUNANTV': '湖南卫视',
  'DRAGONTV': '东方卫视', 'SANSHATV': '三沙卫视', 'XIAMENTV': '厦门卫视',
};

// 央视中文数字别名：央视一套/央1 等
export const CCTV_CN_NUM = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8,
  '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14,
  '十五': 15, '十六': 16, '十七': 17,
};

// 所有频道的有序清单（输出顺序与此一致）
export function allChannels() {
  return [
    ...CCTV_CHANNELS.map(c => ({ ...c, group: '央视' })),
    ...CGTN_CHANNELS.map(c => ({ ...c, group: '央视' })),
    ...SATELLITE_CHANNELS.map(name => ({ key: name, name, group: '卫视' })),
  ];
}
