const fs = require('fs');
const path = require('path');
const axios = require('axios');

const getBuffer = async (url, options = {}) => {
  try {
    const res = await axios({
      method: "get",
      url,
      headers: {
        'DNT': 1,
        'Upgrade-Insecure-Request': 1
      },
      ...options,
      responseType: 'arraybuffer'
    });
    return res.data;
  } catch (err) {
    console.error('Error in getBuffer:', err.message);
    return null;
  }
};

const runtime = (seconds) => {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor(seconds % (3600 * 24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  const dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
  const hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
  const mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
  const sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
  return dDisplay + hDisplay + mDisplay + sDisplay;
};

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getTime = (format) => {
  const moment = require('moment-timezone');
  return moment.tz('Africa/Nairobi').format(format);
};

const isUrl = (url) => {
  return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'));
};

const jsonFormat = (obj) => {
  return JSON.stringify(obj, null, 2);
};

const saveJSON = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving JSON:', err.message);
    return false;
  }
};

const loadJSON = (filePath, defaultData = {}) => {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Error loading JSON:', err.message);
    return defaultData;
  }
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

module.exports = {
  getBuffer,
  runtime,
  formatBytes,
  sleep,
  getTime,
  isUrl,
  jsonFormat,
  saveJSON,
  loadJSON,
  ensureDir,
  ytplay
};

// YouTube Play scraper using free APIs
async function ytplay(query) {
  try {
    // Search using YouTube internal API (no key needed)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const data = response.data;
    
    // Extract video info from HTML
    const videoIdMatch = data.match(/"videoId":"([^"]+)"/);
    const titleMatch = data.match(/"title":{"runs":\[{"text":"([^"]+)"/);
    const durationMatch = data.match(/"lengthText":{"simpleText":"([^"]+)"/);
    const viewsMatch = data.match(/"viewCountText":{"simpleText":"([^"]+)"/);
    const channelMatch = data.match(/"ownerText":{"runs":\[{"text":"([^"]+)"/);
    const thumbnailMatch = data.match(/"url":"(https:\/\/i\.ytimg\.com\/vi\/[^"]+)"/);
    
    if (!videoIdMatch || !titleMatch) {
      return { status: false, message: 'No results found' };
    }
    
    const videoId = videoIdMatch[1];
    const title = titleMatch[1].replace(/\\u0026/g, '&').replace(/\\'/g, "'");
    const duration = durationMatch ? durationMatch[1] : 'Unknown';
    const views = viewsMatch ? viewsMatch[1] : 'Unknown';
    const channel = channelMatch ? channelMatch[1] : 'Unknown';
    const thumbnail = thumbnailMatch ? thumbnailMatch[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get download links using free API
    const downloadUrl = `https://api.agatz.xyz/api/ytmp3?url=${url}`;
    
    let audioUrl = null;
    try {
      const dlResponse = await axios.get(downloadUrl);
      if (dlResponse.data && dlResponse.data.data && dlResponse.data.data.download) {
        audioUrl = dlResponse.data.data.download;
      }
    } catch (e) {
      // Try alternative API
      try {
        const altUrl = `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${url}`;
        const altResponse = await axios.get(altUrl);
        if (altResponse.data && altResponse.data.url) {
          audioUrl = altResponse.data.url;
        }
      } catch (e2) {
        // Fallback to cobalt.tools
        try {
          const cobaltResponse = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            vCodec: 'h264',
            vQuality: '720',
            aFormat: 'mp3',
            isAudioOnly: true
          }, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          
          if (cobaltResponse.data && cobaltResponse.data.url) {
            audioUrl = cobaltResponse.data.url;
          }
        } catch (e3) {
          // All APIs failed
        }
      }
    }
    
    return {
      status: true,
      title: title,
      channel: channel,
      duration: duration,
      views: views,
      thumbnail: thumbnail,
      url: url,
      videoId: videoId,
      audio: audioUrl
    };
    
  } catch (error) {
    console.error('YouTube play error:', error.message);
    return { status: false, message: error.message };
  }
}
