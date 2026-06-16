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
    output: "rtmp://rtmp.livepeer.com/live/ecb4-qw51-gpdb-cj86"
  },

  ch2: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744524.ts",
    output: "rtmp://rtmp.livepeer.com/live/7d57-n258-zcdg-x83m"
  },

  ch3: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744525.ts",
    output: "rtmp://rtmp.livepeer.com/live/2948-k4ao-3qj7-ipxu"
  },

  ch4: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744526.ts",
    output: "rtmp://rtmp.livepeer.com/live/a546-ofhm-g3bd-yl6n"
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


// ▶️ Start Stream
app.get("/start", (req, res) => {
  const id = req.query.id;

  if (!id) return res.send("❌ missing id");

  const channel = channels[id];
  if (!channel) return res.send("❌ channel not found");

  if (ffmpegProcesses[id]) {
    return res.send("⚠️ already running");
  }

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
    console.log(`❌ ${id} exited ${code}`);
    delete ffmpegProcesses[id];

    // 🧹 تنظيف العدّاد
    viewers[id] = 0;

    if (viewerIntervals[id]) {
      clearInterval(viewerIntervals[id]);
      delete viewerIntervals[id];
    }
  });

  ffmpegProcesses[id] = ffmpeg;

  // 👁️ init viewers
  viewers[id] = Math.floor(Math.random() * 10) + 3;

  // 🔥 حركة مشاهدة واقعية
  if (viewerIntervals[id]) clearInterval(viewerIntervals[id]);

  viewerIntervals[id] = setInterval(() => {
    if (!viewers[id]) return;

    let change = Math.floor(Math.random() * 3) - 1; // -1 0 +1
    viewers[id] = Math.max(1, viewers[id] + change);

  }, 4000);

  res.send(`✅ Channel ${id} started`);
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
  </style>
</head>
<body>

<h2>📡 Live Dashboard (Improved Viewers)</h2>

<div id="list"></div>

<script>

async function load() {
  const res = await fetch('/status');
  const data = await res.json();

  const box = document.getElementById('list');
  box.innerHTML = '';

  Object.keys(data).forEach(ch => {
    const d = data[ch];

    box.innerHTML += "<div class='card'>" +
      "<h3>" + ch + " - " + (d.active ? '🟢 LIVE' : '🔴 OFFLINE') + "</h3>" +
      "<p>👁️ Viewers: " + d.viewers + "</p>" +
      "<a href='/start?id=" + ch + "'><button style='background:green;color:white;'>Start</button></a>" +
      "<a href='/stop?id=" + ch + "'><button style='background:red;color:white;'>Stop</button></a>" +
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
});
