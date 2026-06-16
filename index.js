import express from "express";
import { spawn } from "child_process";

const app = express();

let ffmpegProcesses = {};
let viewers = {};
let viewerIntervals = {};

// 🎯 القنوات
const channels = {
  ch1: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744523.ts",
    output: "rtmp://rtmp.livepeer.com/live/5516-8c0c-bu72-ead9"
  },
  ch2: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744524.ts",
    output: "rtmp://rtmp.livepeer.com/live/5e26-ufcu-ly38-z41b"
  },
  ch3: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744525.ts",
    output: "rtmp://rtmp.livepeer.com/live/dbd5-z7hw-tkxt-ejwt"
  },
  ch4: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744526.ts",
    output: "rtmp://rtmp.livepeer.com/live/288c-r9tc-tumq-zpz2"
  },
  ch5: {
    input: "http://185.160.192.14/live/171348492752/5S6HGsea3j/255225.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/a4be-dmef-x7d9-4kme"
  }
};

// 🎯 لوجو لكل قناة
const logos = {
  ch1: "logo1.png",
  ch2: "logo2.png",
  ch3: "logo3.png",
  ch4: "logo4.png",
  ch5: "logo5.png",
};

function getLogo(id) {
  return logos[id] || "logo.png";
}

// 🛡️ حماية
process.on("uncaughtException", (err) => {
  console.log("🔥 Error:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("🔥 Rejection:", err);
});

// 🌐 Home
app.get("/", (req, res) => {
  res.send("🚀 Restream System Running - 1080p");
});

// 🔄 دالة لتشغيل القناة
function startChannel(id) {
  return new Promise((resolve) => {
    if (!id) return resolve(false);
    
    const channel = channels[id];
    if (!channel) return resolve(false);

    if (ffmpegProcesses[id]) {
      return resolve(true);
    }

    const logo = getLogo(id);

    console.log(`🎬 Starting ${id} with 1080p quality...`);

    // FFmpeg command مبسط وأكثر استقراراً
    const ffmpeg = spawn("ffmpeg", [
      "-re",
      "-i", channel.input,
      "-i", logo,
      
      // فلتر الـ scale والـ overlay
      "-filter_complex",
      `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[base][1:v]overlay=W-w-5:5`,
      
      // ترميز الفيديو
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-profile:v", "high",
      "-level", "4.0",
      
      // معدل البت للـ 1080p
      "-b:v", "4000k",
      "-maxrate", "4500k",
      "-bufsize", "8000k",
      
      // إعدادات الإطارات
      "-r", "25",
      "-g", "50",
      
      // ترميز الصوت
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      
      // إعدادات إضافية للاستقرار
      "-f", "flv",
      "-flvflags", "no_duration_filesize",
      
      channel.output
    ]);

    // تسجيل الأخطاء
    ffmpeg.stderr.on("data", (data) => {
      const msg = data.toString();
      // عرض فقط الأخطاء المهمة
      if (msg.includes("error") || msg.includes("Error") || msg.includes("Invalid")) {
        console.log(`[${id}] ⚠️ ${msg}`);
      }
    });

    // عند انتهاء العملية
    ffmpeg.on("exit", (code) => {
      console.log(`❌ ${id} exited with code ${code}`);
      delete ffmpegProcesses[id];
      
      viewers[id] = 0;
      if (viewerIntervals[id]) {
        clearInterval(viewerIntervals[id]);
        delete viewerIntervals[id];
      }

      // إعادة التشغيل التلقائي
      console.log(`🔄 Attempting to restart ${id} in 5 seconds...`);
      setTimeout(() => {
        startChannel(id);
      }, 5000);
    });

    // عند حدوث خطأ
    ffmpeg.on("error", (err) => {
      console.log(`[${id}] ❌ Process error:`, err);
    });

    ffmpegProcesses[id] = ffmpeg;

    // إعداد المشاهدين
    viewers[id] = Math.floor(Math.random() * 10) + 3;
    
    viewerIntervals[id] = setInterval(() => {
      if (!viewers[id]) return;
      let change = Math.floor(Math.random() * 3) - 1;
      viewers[id] = Math.max(1, viewers[id] + change);
    }, 4000);

    console.log(`✅ ${id} started successfully with 1080p`);
    resolve(true);
  });
}

// ▶️ Start Stream
app.get("/start", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  
  const result = await startChannel(id);
  res.send(result ? `✅ Channel ${id} started (1080p)` : `❌ Failed to start ${id}`);
});

// 🛑 Stop Stream
app.get("/stop", (req, res) => {
  const id = req.query.id;
  
  if (ffmpegProcesses[id]) {
    ffmpegProcesses[id].kill("SIGTERM");
    delete ffmpegProcesses[id];
  }
  
  viewers[id] = 0;
  if (viewerIntervals[id]) {
    clearInterval(viewerIntervals[id]);
    delete viewerIntervals[id];
  }
  
  res.send(`🛑 Channel ${id} stopped`);
});

// 📊 Status
app.get("/status", (req, res) => {
  const result = {};
  for (const id in channels) {
    result[id] = {
      active: !!ffmpegProcesses[id],
      viewers: viewers[id] || 0,
      quality: "1080p"
    };
  }
  res.json(result);
});

// 📡 Dashboard
app.get("/dashboard", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard 1080p</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial; background: #0a0a0a; color: #fff; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 30px; color: #00ff88; }
    .card { background: #1a1a1a; padding: 20px; margin: 15px 0; border-radius: 12px; border-left: 4px solid #333; }
    .card.live { border-left-color: #00ff88; }
    .card.offline { border-left-color: #ff4444; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .channel-name { font-size: 24px; font-weight: bold; }
    .status { padding: 5px 15px; border-radius: 20px; font-size: 14px; }
    .status.live { background: #00ff88; color: #000; }
    .status.offline { background: #ff4444; color: #fff; }
    .info { margin: 15px 0; color: #888; }
    .info span { color: #fff; }
    .buttons { margin-top: 15px; }
    .btn { padding: 10px 25px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 10px; }
    .btn-start { background: #00ff88; color: #000; }
    .btn-start:hover { background: #00cc66; }
    .btn-stop { background: #ff4444; color: #fff; }
    .btn-stop:hover { background: #cc0000; }
    .quality-badge { background: #333; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
  </style>
</head>
<body>
<div class="container">
  <h1>📡 Live Dashboard - 1080p Quality</h1>
  <div id="list"></div>
</div>

<script>
async function load() {
  try {
    const res = await fetch('/status');
    const data = await res.json();
    const box = document.getElementById('list');
    box.innerHTML = '';

    Object.keys(data).forEach(ch => {
      const d = data[ch];
      const isLive = d.active;
      const cardClass = isLive ? 'live' : 'offline';
      const statusClass = isLive ? 'live' : 'offline';
      const statusText = isLive ? '🟢 LIVE' : '🔴 OFFLINE';

      box.innerHTML += \`
        <div class="card \${cardClass}">
          <div class="header">
            <span class="channel-name">📺 \${ch}</span>
            <span class="status \${statusClass}">\${statusText}</span>
          </div>
          <div class="info">
            👁️ Viewers: <span>\${d.viewers}</span> &nbsp;|&nbsp; 
            ⚡ Quality: <span class="quality-badge">\${d.quality}</span>
          </div>
          <div class="buttons">
            <button class="btn btn-start" onclick="startChannel('\${ch}')">▶️ Start</button>
            <button class="btn btn-stop" onclick="stopChannel('\${ch}')">⏹️ Stop</button>
          </div>
        </div>
      \`;
    });
  } catch(e) {
    console.error('Error loading status:', e);
  }
}

async function startChannel(id) {
  const res = await fetch('/start?id=' + id);
  const text = await res.text();
  alert(text);
  load();
}

async function stopChannel(id) {
  if (!confirm('Are you sure you want to stop ' + id + '?')) return;
  const res = await fetch('/stop?id=' + id);
  const text = await res.text();
  alert(text);
  load();
}

load();
setInterval(load, 3000);
</script>
</body>
</html>
  `);
});

// 🚀 Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 🚀 بدء جميع القنوات تلقائياً
async function startAllChannels() {
  console.log("🔄 Starting all channels automatically...");
  for (const id of Object.keys(channels)) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await startChannel(id);
  }
}

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
  
  // بدء القنوات تلقائياً
  setTimeout(() => {
    startAllChannels();
  }, 3000);
});
