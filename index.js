import express from "express";
import { spawn } from "child_process";

const app = express();

let ffmpegProcesses = {};
let viewers = {};
let viewerIntervals = {};
let restartTimeouts = {}; // جديد: لتتبع محاولات إعادة التشغيل

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

// 🔄 دالة تشغيل القناة (معدلة لدعم إعادة التشغيل التلقائي)
function startChannel(id, autoRestart = true) {
  const channel = channels[id];
  if (!channel) return false;

  // إذا كانت القناة مشغلة بالفعل
  if (ffmpegProcesses[id]) {
    return true;
  }

  const logo = getLogo(id);

  console.log(`▶️ بدء تشغيل القناة ${id} ${autoRestart ? '(تلقائي)' : '(يدوي)'}`);

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

    // تنظيف العدّاد
    viewers[id] = 0;
    if (viewerIntervals[id]) {
      clearInterval(viewerIntervals[id]);
      delete viewerIntervals[id];
    }

    // 🔥 إعادة التشغيل التلقائي إذا كانت مفعلة
    if (autoRestart) {
      console.log(`🔄 سيتم إعادة تشغيل ${id} خلال 5 ثواني...`);
      
      // إلغاء أي تايم أوت سابق
      if (restartTimeouts[id]) {
        clearTimeout(restartTimeouts[id]);
        delete restartTimeouts[id];
      }

      restartTimeouts[id] = setTimeout(() => {
        console.log(`🔄 إعادة تشغيل ${id} تلقائياً...`);
        startChannel(id, true);
        delete restartTimeouts[id];
      }, 5000);
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

  return true;
}

// 🛑 دالة إيقاف القناة (معدلة)
function stopChannel(id) {
  if (ffmpegProcesses[id]) {
    ffmpegProcesses[id].kill("SIGKILL");
    delete ffmpegProcesses[id];
  }

  viewers[id] = 0;
  if (viewerIntervals[id]) {
    clearInterval(viewerIntervals[id]);
    delete viewerIntervals[id];
  }

  // إلغاء أي إعادة تشغيل تلقائي مجدول
  if (restartTimeouts[id]) {
    clearTimeout(restartTimeouts[id]);
    delete restartTimeouts[id];
  }

  console.log(`🛑 ${id} تم إيقافها`);
}

// 🌐 Home
app.get("/", (req, res) => {
  res.send("🚀 Restream System Running - تشغيل تلقائي للقنوات");
});

// ▶️ Start Stream (يدوي مع إلغاء إعادة التشغيل التلقائي)
app.get("/start", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  if (!channels[id]) return res.send("❌ channel not found");

  // إلغاء أي إعادة تشغيل تلقائي سابق
  if (restartTimeouts[id]) {
    clearTimeout(restartTimeouts[id]);
    delete restartTimeouts[id];
  }

  const started = startChannel(id, false); // false = بدون إعادة تشغيل تلقائي
  if (started) {
    res.send(`✅ Channel ${id} started (بدون إعادة تشغيل تلقائي)`);
  } else {
    res.send(`❌ Failed to start ${id}`);
  }
});

// 🛑 Stop Stream
app.get("/stop", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  
  stopChannel(id);
  res.send(`🛑 Channel ${id} stopped`);
});

// 🔄 مسار جديد: تفعيل إعادة التشغيل التلقائي لقناة معينة
app.get("/enable-auto", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  if (!channels[id]) return res.send("❌ channel not found");

  // إذا كانت القناة متوقفة، نشغلها مع إعادة تشغيل تلقائي
  if (!ffmpegProcesses[id]) {
    startChannel(id, true);
    res.send(`✅ ${id} تم تشغيلها مع إعادة تشغيل تلقائي`);
  } else {
    // إذا كانت تعمل، نعدل الإعدادات (نوقف ونشغل مع autoRestart)
    stopChannel(id);
    setTimeout(() => {
      startChannel(id, true);
    }, 1000);
    res.send(`✅ ${id} تم تفعيل إعادة التشغيل التلقائي`);
  }
});

// 🔄 تشغيل كل القنوات تلقائياً عند بدء السيرفر
function startAllChannels() {
  console.log("🚀 بدء تشغيل جميع القنوات تلقائياً...");
  Object.keys(channels).forEach((id, index) => {
    setTimeout(() => {
      startChannel(id, true); // true = مع إعادة تشغيل تلقائي
    }, index * 2000); // ننتظر 2 ثانية بين كل قناة والأخرى
  });
}

// 📊 Status (معدل لعرض حالة إعادة التشغيل)
app.get("/status", (req, res) => {
  const result = {};
  for (const id in channels) {
    result[id] = {
      active: !!ffmpegProcesses[id],
      viewers: viewers[id] || 0,
      autoRestart: !!restartTimeouts[id] // هل يوجد إعادة تشغيل مجدول؟
    };
  }
  res.json(result);
});

// 📡 Dashboard (معدل)
app.get("/dashboard", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard - تشغيل تلقائي</title>
  <style>
    body { font-family: Arial; background:#111; color:#fff; padding:20px; }
    .card { background:#222; padding:15px; margin:10px 0; border-radius:10px; }
    button { padding:8px 12px; margin:5px; cursor:pointer; border:none; border-radius:5px; }
    .green { background:#2ecc71; color:#fff; }
    .red { background:#e74c3c; color:#fff; }
    .blue { background:#3498db; color:#fff; }
    .auto { background:#9b59b6; color:#fff; }
    .status-badge { padding:3px 10px; border-radius:15px; font-size:12px; }
    .live { background:#2ecc71; color:#fff; }
    .offline { background:#e74c3c; color:#fff; }
    .restarting { background:#f39c12; color:#fff; }
  </style>
</head>
<body>

<h2>📡 Live Dashboard - تشغيل تلقائي</h2>
<p style="color:#aaa;">✅ جميع القنوات تعمل تلقائياً عند بدء التشغيل وتعيد التشغيل عند التوقف</p>

<div id="list"></div>

<script>

async function load() {
  const res = await fetch('/status');
  const data = await res.json();

  const box = document.getElementById('list');
  box.innerHTML = '';

  Object.keys(data).forEach(ch => {
    const d = data[ch];
    const statusClass = d.active ? 'live' : (d.autoRestart ? 'restarting' : 'offline');
    const statusText = d.active ? '🟢 LIVE' : (d.autoRestart ? '🔄 ستعاد تشغيلها' : '🔴 OFFLINE');
    
    box.innerHTML += "<div class='card'>" +
      "<h3>" + ch + 
      " <span class='status-badge " + statusClass + "'>" + statusText + "</span>" +
      "</h3>" +
      "<p>👁️ المشاهدين: " + d.viewers + "</p>" +
      "<p style='font-size:12px;color:#aaa;'>" + 
      (d.active ? '✅ تعمل حالياً' : (d.autoRestart ? '⏳ سيتم إعادة التشغيل تلقائياً' : '❌ متوقفة')) +
      "</p>" +
      "<a href='/start?id=" + ch + "'><button class='green'>▶️ تشغيل (بدون إعادة تشغيل)</button></a>" +
      "<a href='/stop?id=" + ch + "'><button class='red'>⏹ إيقاف</button></a>" +
      "<a href='/enable-auto?id=" + ch + "'><button class='auto'>🔄 تفعيل إعادة التشغيل</button></a>" +
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
  const activeChannels = Object.keys(ffmpegProcesses).length;
  res.json({
    status: "OK",
    activeChannels: activeChannels,
    totalChannels: Object.keys(channels).length
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
  console.log("📊 Dashboard: http://localhost:" + port + "/dashboard");
  
  // 🎯 بدء تشغيل جميع القنوات تلقائياً بعد 3 ثواني
  console.log("⏳ سيتم بدء تشغيل جميع القنوات خلال 3 ثواني...");
  setTimeout(startAllChannels, 3000);
});
