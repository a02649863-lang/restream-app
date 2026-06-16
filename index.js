import express from "express";
import { spawn } from "child_process";

const app = express();

let ffmpegProcesses = {};

// 👁️ عداد مشاهدين (محسن بدل fake ثابت)
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
  res.send("🚀 Restream System Running FINAL (Improved Viewers)");
});

// 🔄 دالة لتشغيل القناة
function startChannel(id) {
  if (!id) return false;
  
  const channel = channels[id];
  if (!channel) return false;

  if (ffmpegProcesses[id]) {
    return true; // بالفعل تعمل
  }

  const logo = getLogo(id);

  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-fflags", "+genpts+discardcorrupt+igndts",
    "-flags", "low_delay",
    "-analyzeduration", "0",
    "-probesize", "32",
    "-rtbufsize", "512M",

    "-i", channel.input,
    "-i", logo,

    "-filter_complex",
    "[0:v]scale=1920:1080:flags=lanczos,setsar=1[base];[base][1:v]overlay=W-w-5:5",

    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "high",
    "-level", "4.0",
    
    // إعدادات البت rate المحسنة لـ 1080p مع استقرار
    "-b:v", "5000k",
    "-maxrate", "5500k",
    "-bufsize", "12000k",
    
    "-r", "25",
    "-g", "50",
    
    // إعدادات الـ rate control لتحسين الاستقرار
    "-rc-lookahead", "30",
    "-x264-params", "keyint=50:min-keyint=25:scenecut=0",
    
    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", "48000",
    
    // تحسين الـ buffering
    "-f", "flv",
    "-flvflags", "no_duration_filesize",
    channel.output
  ]);

  ffmpeg.stderr.on("data", (d) => {
    console.log(`[${id}] ${d.toString()}`);
  });

  ffmpeg.on("exit", (code) => {
    console.log(`❌ ${id} exited ${code}`);
    delete ffmpegProcesses[id];

    // تنظيف العدّاد
    viewers[id] = 0;

    if (viewerIntervals[id]) {
      clearInterval(viewerIntervals[id]);
      delete viewerIntervals[id];
    }

    // 🔄 إعادة التشغيل التلقائي عند الانقطاع
    console.log(`🔄 Restarting ${id} automatically...`);
    setTimeout(() => {
      startChannel(id);
    }, 3000); // انتظر 3 ثواني قبل إعادة التشغيل
  });

  ffmpegProcesses[id] = ffmpeg;

  // init viewers
  viewers[id] = Math.floor(Math.random() * 10) + 3;

  // حركة مشاهدة واقعية
  if (viewerIntervals[id]) clearInterval(viewerIntervals[id]);

  viewerIntervals[id] = setInterval(() => {
    if (!viewers[id]) return;

    let change = Math.floor(Math.random() * 3) - 1; // -1 0 +1
    viewers[id] = Math.max(1, viewers[id] + change);

  }, 4000);

  console.log(`✅ Channel ${id} started`);
  return true;
}

// ▶️ Start Stream
app.get("/start", (req, res) => {
  const id = req.query.id;

  if (!id) return res.send("❌ missing id");

  if (startChannel(id)) {
    res.send(`✅ Channel ${id} started`);
  } else {
    res.send(`❌ Failed to start channel ${id}`);
  }
});

// 🛑 Stop Stream
app.get("/stop", (req, res) => {
  const id = req.query.id;

  if (ffmpegProcesses[id]) {
    ffmpegProcesses[id].kill("SIGKILL");
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
      viewers: viewers[id] || 0
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
  <title>Dashboard</title>
  <style>
    body { font-family: Arial; background:#111; color:#fff; padding:20px; }
    .card { background:#222; padding:15px; margin:10px 0; border-radius:10px; }
    button { padding:8px 12px; margin:5px; cursor:pointer; }
    .status-badge { display:inline-block; padding:3px 10px; border-radius:5px; font-size:12px; }
    .live { background:#00ff00; color:#000; }
    .offline { background:#ff0000; color:#fff; }
  </style>
</head>
<body>

<h2>📡 Live Dashboard (1080p - Auto Restart)</h2>

<div id="list"></div>

<script>

async function load() {
  const res = await fetch('/status');
  const data = await res.json();

  const box = document.getElementById('list');
  box.innerHTML = '';

  Object.keys(data).forEach(ch => {
    const d = data[ch];

    const statusClass = d.active ? 'live' : 'offline';
    const statusText = d.active ? '🟢 LIVE' : '🔴 OFFLINE';

    box.innerHTML += "<div class='card'>" +
      "<h3>" + ch + " - <span class='status-badge " + statusClass + "'>" + statusText + "</span></h3>" +
      "<p>👁️ Viewers: " + d.viewers + "</p>" +
      "<p style='font-size:12px;color:#888;'>⚡ Quality: 1080p @ 5000kbps</p>" +
      "<a href='/start?id=" + ch + "'><button style='background:green;color:white;'>▶️ Start</button></a>" +
      "<a href='/stop?id=" + ch + "'><button style='background:red;color:white;'>⏹️ Stop</button></a>" +
      "</div>";
  });
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
  res.send("OK");
});

// 🚀 بدء جميع القنوات تلقائياً عند تشغيل السيرفر
function startAllChannels() {
  console.log("🔄 Starting all channels automatically...");
  Object.keys(channels).forEach(id => {
    setTimeout(() => {
      startChannel(id);
    }, 1000); // تأخير بسيط بين كل قناة
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
  // بدء جميع القنوات تلقائياً عند تشغيل السيرفر
  startAllChannels();
});
