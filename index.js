import express from "express";
import { spawn } from "child_process";

const app = express();

let ffmpegProcesses = {};

// 👁️ عداد مشاهدين (محسن بدل fake ثابت)
let viewers = {};
let viewerIntervals = {};

// 🔄 إعدادات إعادة التشغيل التلقائي
let autoRestartEnabled = true; // تشغيل الميزة تلقائياً
let restartCheckInterval = null;

// 🎯 القنوات
const channels = {
  ch1: {
    input: "http://palestine.vibertv.cyou/post1/index.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/5516-8c0c-bu72-ead9"
  },

  ch2: {
    input: "http://palestine.vibertv.cyou/post2/index.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/5e26-ufcu-ly38-z41b"
  },

  ch3: {
    input: "http://palestine.vibertv.cyou/post3/index.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/dbd5-z7hw-tkxt-ejwt"
  },

  ch4: {
    input: "http://palestine.vibertv.cyou/post4/index.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/288c-r9tc-tumq-zpz2"
  },

  ch5: {
    input: "http://palestine.vibertv.cyou/post5/index.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/2d30-fvmv-j7ga-a9ub"
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
  res.send("🚀 Restream System Running FINAL (With Auto-Restart)");
});

// 🔄 دالة بدء القناة (معدلة لتُستخدم داخلياً)
function startChannel(id) {
  const channel = channels[id];
  if (!channel) return false;

  if (ffmpegProcesses[id]) return true;

  const logo = getLogo(id);

  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-fflags", "+genpts+discardcorrupt",
    "-flags", "low_delay",

    "-i", channel.input,
    "-i", logo,

    "-filter_complex",
    "[0:v]scale=1280:720,setsar=1[base];[base][1:v]overlay=W-w-5:5",

    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "high",
    "-b:v", "4500k",
    "-maxrate", "5000k",
    "-bufsize", "10000k",
    "-r", "25",
    "-g", "50",

    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", "48000",

    "-f", "flv",
    channel.output
  ]);

  ffmpeg.stderr.on("data", (d) => {
    console.log(`[${id}] ${d.toString()}`);
  });

  ffmpeg.on("exit", (code) => {
    console.log(`❌ ${id} exited with code ${code}`);
    delete ffmpegProcesses[id];

    // 🧹 تنظيف العدّاد
    viewers[id] = 0;

    if (viewerIntervals[id]) {
      clearInterval(viewerIntervals[id]);
      delete viewerIntervals[id];
    }

    // 🔄 إعادة التشغيل التلقائي إذا كانت الميزة مفعلة
    if (autoRestartEnabled) {
      console.log(`🔄 Attempting to restart ${id} automatically...`);
      setTimeout(() => {
        startChannel(id);
      }, 3000); // انتظار 3 ثواني قبل إعادة التشغيل
    }
  });

  ffmpegProcesses[id] = ffmpeg;

  // 👁️ init viewers
  viewers[id] = Math.floor(Math.random() * 10) + 3;

  // 🔥 حركة مشاهدة واقعية
  if (viewerIntervals[id]) clearInterval(viewerIntervals[id]);

  viewerIntervals[id] = setInterval(() => {
    if (!viewers[id]) return;

    let change = Math.floor(Math.random() * 3) - 1;
    viewers[id] = Math.max(1, viewers[id] + change);
  }, 4000);

  console.log(`✅ Channel ${id} started successfully`);
  return true;
}

// 🔄 دالة فحص جميع القنوات وإعادة تشغيل المتوقفة
function checkAndRestartAll() {
  if (!autoRestartEnabled) return;

  console.log("🔍 Checking all channels...");
  
  for (const id in channels) {
    if (!ffmpegProcesses[id]) {
      console.log(`⚠️ Channel ${id} is offline, restarting...`);
      startChannel(id);
    }
  }
}

// ▶️ Start Stream (API)
app.get("/start", (req, res) => {
  const id = req.query.id;

  if (!id) return res.send("❌ missing id");

  const channel = channels[id];
  if (!channel) return res.send("❌ channel not found");

  if (startChannel(id)) {
    res.send(`✅ Channel ${id} started`);
  } else {
    res.send(`❌ Failed to start ${id}`);
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
      viewers: viewers[id] || 0,
      autoRestart: autoRestartEnabled
    };
  }

  res.json(result);
});

// 🔄 تفعيل/إيقاف إعادة التشغيل التلقائي
app.get("/toggle-auto", (req, res) => {
  autoRestartEnabled = !autoRestartEnabled;
  
  if (autoRestartEnabled) {
    res.send("✅ Auto-restart ENABLED");
    // فحص فوري عند التفعيل
    checkAndRestartAll();
  } else {
    res.send("⛔ Auto-restart DISABLED");
  }
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
    .info { background:#1a1a2e; padding:10px; margin:10px 0; border-radius:8px; }
    .badge { 
      display:inline-block; padding:3px 10px; border-radius:12px; 
      font-size:12px; font-weight:bold; margin-left:10px;
    }
    .badge-green { background:#00cc44; color:#fff; }
    .badge-red { background:#ff3333; color:#fff; }
  </style>
</head>
<body>

<h2>📡 Live Dashboard (Auto-Restart Active)</h2>

<div class="info" id="autoStatus">
  🔄 Auto-Restart: <span id="autoText">Loading...</span>
  <a href="/toggle-auto"><button id="toggleBtn" style="background:#ff8800;color:#fff;">Toggle</button></a>
</div>

<div id="list"></div>

<script>

async function load() {
  const res = await fetch('/status');
  const data = await res.json();

  const box = document.getElementById('list');
  box.innerHTML = '';

  // تحديث حالة auto-restart
  const firstChannel = Object.values(data)[0];
  if (firstChannel) {
    const isEnabled = firstChannel.autoRestart;
    document.getElementById('autoText').innerHTML = 
      isEnabled ? '<span class="badge badge-green">ENABLED</span>' : 
                  '<span class="badge badge-red">DISABLED</span>';
  }

  Object.keys(data).forEach(ch => {
    const d = data[ch];

    box.innerHTML += "<div class='card'>" +
      "<h3>" + ch + " - " + (d.active ? '🟢 LIVE' : '🔴 OFFLINE') + "</h3>" +
      "<p>👁️ Viewers: " + d.viewers + "</p>" +
      "<a href='/start?id=" + ch + "'><button style='background:green;color:white;'>▶ Start</button></a>" +
      "<a href='/stop?id=" + ch + "'><button style='background:red;color:white;'>⏹ Stop</button></a>" +
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

// 🚀 بدء تشغيل جميع القنوات تلقائياً عند تشغيل السيرفر
function startAllChannels() {
  console.log("🚀 Starting all channels automatically...");
  for (const id in channels) {
    startChannel(id);
  }
}

// 🔄 بدء فحص دوري كل 15 ثانية
function startAutoCheck() {
  if (restartCheckInterval) {
    clearInterval(restartCheckInterval);
  }
  
  restartCheckInterval = setInterval(() => {
    checkAndRestartAll();
  }, 15000); // كل 15 ثانية
  
  console.log("✅ Auto-check started (every 15 seconds)");
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
  
  // بدء جميع القنوات تلقائياً
  startAllChannels();
  
  // بدء نظام الفحص الدوري
  startAutoCheck();
});
