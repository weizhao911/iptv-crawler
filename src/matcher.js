// ============================================================
// 频道名归一化与匹配
// 把 "CCTV5+ 体育赛事"、"cctv-5＋"、"CCTV5体育" 等各种写法
// 归一到频道清单的标准 key
// ============================================================
import {
  SATELLITE_ALIASES, SATELLITE_EN_ALIASES, CCTV_CN_NUM, allChannels,
} from './config.js';

// 常见画质/干扰词，剥除后不影响频道身份
const NOISE_WORDS = new RegExp([
  '超高清', '超清', '高清', '标清', '蓝光', 'HDR', 'IPTV', 'VIP', 'TEST', '测试',
  '备份', 'HEVC', 'H265', 'H264', 'FLV', 'FHD', 'SD', 'HD', '4K', '8K',
  '\\d{3,4}P', '50FPS', '60FPS', 'WIFI',
].join('|'), 'g');

// 全角字符转半角
function toHalfWidth(s) {
  return s.replace(/[\uFF01-\uFF5E\u3000]/g, ch =>
    ch === '\u3000' ? ' ' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

// 预构建频道索引：normalizedKey -> 频道对象
const CHANNEL_INDEX = (() => {
  const idx = new Map();
  for (const ch of allChannels()) {
    idx.set(ch.key, ch);
    // 频道标准名（如 "CCTV-1 综合"）本身也可作为查找键
    idx.set(ch.name, ch);
    const noSpace = ch.name.replace(/\s+/g, '');
    if (noSpace !== ch.name) idx.set(noSpace, ch);
  }
  // 卫视别名
  for (const [alias, std] of Object.entries(SATELLITE_ALIASES)) {
    const target = idx.get(std);
    if (target) idx.set(alias, target);
  }
  return idx;
})();

/**
 * 归一化频道名，返回频道对象（找不到返回 null）
 * @param {string} raw 上游 EXTINF 里的频道名
 */
export function matchChannel(raw) {
  let s = toHalfWidth(String(raw || '')).toUpperCase().trim();

  // 去括号内容：CCTV1(综合) / 湖南（高清）
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '');
  // 去所有分隔符与空白：CCTV-5+ → CCTV5+（注意 '-' 必须放字符类末尾，避免被解析为范围）
  s = s.replace(/[\s·．_—–/\\|:,，、:.'’－-]+/g, '');
  if (!s) return null;

  // ---- CCTV-4K / 8K 特判（"4K"是身份词，不能当画质剥掉）----
  if (/^(CCTV|央视)[04]*4K/.test(s) || /^CCTV0*4K/.test(s)) return CHANNEL_INDEX.get('CCTV-4K') || null;
  if (/^(CCTV|央视)[08]*8K/.test(s) || /^CCTV0*8K/.test(s)) return CHANNEL_INDEX.get('CCTV-8K') || null;

  // 剥画质与干扰词
  s = s.replace(NOISE_WORDS, '');
  if (!s) return null;

  // ---- 精确命中索引（标准名/别名）----
  if (CHANNEL_INDEX.has(s)) return CHANNEL_INDEX.get(s);

  // ---- iptv-org 等国际源英文命名（剥 SATELLITE 后查表）----
  const enKey = s.replace(/SATELLITE/g, '');
  if (SATELLITE_EN_ALIASES[enKey]) {
    const target = CHANNEL_INDEX.get(SATELLITE_EN_ALIASES[enKey]);
    if (target) return target;
  }

  // ---- CCTV 编号：CCTV5 / CCTV5+ / CCTV17农业农村 / 央5 ----
  let m = s.match(/^CCTV0*(\d{1,2})(\+|PLUS|P)?/);
  if (!m) m = s.match(/^央视0*(\d{1,2})套?(\+|PLUS|P)?/);
  if (!m) m = s.match(/^央0*(\d{1,2})(\+|PLUS|P)?/);
  if (m) {
    const num = parseInt(m[1], 10);
    const plus = m[2] && m[2] !== '' && m[2] !== 'P' ? '+' : '';
    if (plus) {
      if (num === 5) return CHANNEL_INDEX.get('CCTV-5+') || null;
      return null; // 5+ 之外没有带 + 的央视频道
    }
    if (num >= 1 && num <= 17) return CHANNEL_INDEX.get(`CCTV-${num}`) || null;
    return null;
  }

  // ---- CCTV-5PLUS 变体 ----
  m = s.match(/^CCTV0*5(PLUS|\+)/);
  if (m) return CHANNEL_INDEX.get('CCTV-5+') || null;

  // ---- 央视中文数字：央视一套 / CCTV一 ----
  m = s.match(/^(?:央视|CCTV|CCTV)?(一套|二套|三套|四套|五套|六套|七套|八套|九套|十套|十一套|十二套|十三套|十四套|十五套|十六套|十七套)$/)
    || s.match(/^央视(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七)$/);
  if (m) {
    const cn = m[1].replace(/套$/, '');
    const num = CCTV_CN_NUM[cn];
    if (num) return CHANNEL_INDEX.get(`CCTV-${num}`) || null;
  }

  // ---- CGTN ----
  m = s.match(/^CGTN(?:英语|纪录|西班牙语|法语|俄语|阿拉伯语|ENGLISH|DOCUMENTARY|ESPANOL|FRANCAIS|PYCCKNN|ARABIC)?$/);
  if (m) {
    const tail = m[0].slice(4); // 去掉 CGTN 前缀
    let key = 'CGTN-EN';
    if (/纪录|DOCUMENTARY/.test(tail)) key = 'CGTN-DOC';
    else if (/西班牙语|ESPANOL/.test(tail)) key = 'CGTN-ES';
    else if (/法语|FRANCAIS/.test(tail)) key = 'CGTN-FR';
    else if (/俄语|PYCCKNN/.test(tail)) key = 'CGTN-RU';
    else if (/阿拉伯语|ARABIC/.test(tail)) key = 'CGTN-AR';
    return CHANNEL_INDEX.get(key) || null;
  }
  if (/^(中国环球电视网|环球电视网)/.test(s)) return CHANNEL_INDEX.get('CGTN-EN') || null;

  // ---- 卫视：湖南卫视 / 湖南 / 东南卫视高清 ----
  m = s.match(/^(.+?)(?:卫视|SATELLITETV|TV)$/);
  let cand = null;
  if (m && m[1]) cand = m[1] + '卫视';
  else if (s.endsWith('卫视')) cand = s;
  if (cand) {
    if (CHANNEL_INDEX.has(cand)) return CHANNEL_INDEX.get(cand);
    const aliased = SATELLITE_ALIASES[cand];
    if (aliased && CHANNEL_INDEX.has(aliased)) return CHANNEL_INDEX.get(aliased);
  }

  return null;
}

/**
 * 判断频道是否在目标清单中（用于调试/统计）
 */
export function isTargetChannel(key) {
  return CHANNEL_INDEX.has(key);
}
