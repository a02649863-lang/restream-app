import express from "express";
import { spawn } from "child_process";

const app = express();

let ffmpegProcesses = {};
let viewers = {};
let viewerIntervals = {};
let restartTimeouts = {};
let restartAttempts = {};

// 🎯 القنوات
const channels = {
  ch1: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744523.ts",
    output: "rtmp://rtmp.livepeer.com/live/5516-8c0c-bu72-ead9",
    type: "ts"
  },
  ch2: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744524.ts",
    output: "rtmp://rtmp.livepeer.com/live/5e26-ufcu-ly38-z41b",
    type: "ts"
  },
  ch3: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744525.ts",
    output: "rtmp://rtmp.livepeer.com/live/dbd5-z7hw-tkxt-ejwt",
    type: "ts"
  },
  ch4: {
    input: "http://rgkkw.live/live/akheelasharaf/97430689947/744526.ts",
    output: "rtmp://rtmp.livepeer.com/live/288c-r9tc-tumq-zpz2",
    type: "ts"
  },
  ch5: {
    input: "http://185.160.192.14/live/171348492752/5S6HGsea3j/255225.m3u8",
    output: "rtmp://rtmp.livepeer.com/live/2d30-fvmv-j7ga-a9ub",
    type: "m3u8"
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

// 🔄 دالة تشغيل القناة المحسنة
function startChannel(id, autoRestart = true) {
  const channel = channels[id];
  if (!channel) return false;

  // إذا كانت القناة مشغلة بالفعل
  if (ffmpegProcesses[id]) {
    return true;
  }

  const logo = getLogo(id);
  
  // إعادة تعيين محاولات إعادة التشغيل
  if (!restartAttempts[id]) {
    restartAttempts[id] = 0;
  }

  console.log(`▶️ بدء تشغيل القناة ${id} ${autoRestart ? '(تلقائي)' : '(يدوي)'}`);

  // بناء أمر ffmpeg المحسن
  let ffmpegArgs = [
    "-loglevel", "error", // تقليل الـ logs
    "-threads", "2", // تحسين الأداء
  ];

  // معالجة مختلفة حسب نوع الرابط
  if (channel.type === "m3u8") {
    // للـ m3u8 نستخدم معاملات خاصة
    ffmpegArgs = ffmpegArgs.concat([
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-timeout", "10000000",
      "-i", channel.input
    ]);
  } else {
    // للـ ts نستخدم معاملات عادية مع تحسينات
    ffmpegArgs = ffmpegArgs.concat([
      "-re",
      "-fflags", "+genpts+discardcorrupt+igndts", // إضافة igndts لتجاهل مشاكل التايم
      "-flags", "low_delay",
      "-i", channel.input
    ]);
  }

  // إضافة اللوجو ومعاملات التشفير المحسنة
  ffmpegArgs = ffmpegArgs.concat([
    "-i", logo,
    "-filter_complex",
    "[0:v]scale=1280:720:flags=fast_bilinear,setsar=1,setpts=PTS-STARTPTS[base];[base][1:v]overlay=W-w-5:5:format=auto,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "high",
    "-b:v", "4000k", // خفض البت ريت قليلاً لتقليل التقطيع
    "-maxrate", "4500k",
    "-bufsize", "8000k",
    "-r", "25",
    "-g", "50",
    "-keyint_min", "25",
    "-sc_threshold", "0",
    "-c:a", "aac",
    "-b:a", "128k", // خفض الصوت قليلاً
    "-ar", "44100",
    "-f", "flv",
    "-flvflags", "no_duration_filesize", // تحسين للـ flv
    channel.output
  ]);

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  // معالجة الأخطاء بشكل أفضل
  ffmpeg.stderr.on("data", (d) => {
    const msg = d.toString();
    // عرض الأخطاء المهمة فقط
    if (msg.includes("error") || msg.includes("Error") || msg.includes("failed")) {
      console.log(`[${id}] ⚠️ ${msg}`);
    } else {
      console.log(`[${id}] ${msg}`);
    }
  });

  ffmpeg.on("exit", (code, signal) => {
    console.log(`❌ ${id} توقفت برمز ${code} ${signal ? '(إشارة: '+signal+')' : ''}`);
    delete ffmpegProcesses[id];

    // تنظيف العدّاد
    viewers[id] = 0;
    if (viewerIntervals[id]) {
      clearInterval(viewerIntervals[id]);
      delete viewerIntervals[id];
    }

    // إعادة التشغيل التلقائي مع زيادة المحاولات
    if (autoRestart) {
      restartAttempts[id] = (restartAttempts[id] || 0) + 1;
      
      // إذا تجاوزت 5 محاولات، ننتظر أطول
      const waitTime = restartAttempts[id] > 5 ? 30000 : 5000;
      
      console.log(`🔄 محاولة إعادة تشغيل ${id} (محاولة رقم ${restartAttempts[id]}) خلال ${waitTime/1000} ثواني...`);
      
      // إلغاء أي تايم أوت سابق
      if (restartTimeouts[id]) {
        clearTimeout(restartTimeouts[id]);
        delete restartTimeouts[id];
      }

      restartTimeouts[id] = setTimeout(() => {
        console.log(`🔄 إعادة تشغيل ${id} تلقائياً (محاولة ${restartAttempts[id]})...`);
        startChannel(id, true);
        delete restartTimeouts[id];
      }, waitTime);
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

  // إعادة تعيين محاولات إعادة التشغيل عند النجاح
  restartAttempts[id] = 0;

  return true;
}

// 🛑 دالة إيقاف القناة
function stopChannel(id, preventRestart = true) {
  if (ffmpegProcesses[id]) {
    // محاولة إيقاف نظيف أولاً
    ffmpegProcesses[id].stdin.end();
    ffmpegProcesses[id].kill("SIGTERM");
    
    // بعد ثانية، إذا لم يتوقف نستخدم SIGKILL
    setTimeout(() => {
      if (ffmpegProcesses[id]) {
        ffmpegProcesses[id].kill("SIGKILL");
        delete ffmpegProcesses[id];
      }
    }, 1000);
    
    delete ffmpegProcesses[id];
  }

  viewers[id] = 0;
  if (viewerIntervals[id]) {
    clearInterval(viewerIntervals[id]);
    delete viewerIntervals[id];
  }

  // إلغاء إعادة التشغيل التلقائي
  if (restartTimeouts[id]) {
    clearTimeout(restartTimeouts[id]);
    delete restartTimeouts[id];
  }
  
  // إعادة تعيين محاولات إعادة التشغيل
  restartAttempts[id] = 0;

  console.log(`🛑 ${id} تم إيقافها ${preventRestart ? '(لن تعاد تشغيلها تلقائياً)' : ''}`);
}

// 🌐 Home
app.get("/", (req, res) => {
  res.send("🚀 Restream System Running - تشغيل تلقائي للقنوات (محسن)");
});

// ▶️ Start Stream (يدوي)
app.get("/start", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  if (!channels[id]) return res.send("❌ channel not found");

  // إلغاء أي إعادة تشغيل تلقائي قديمة
  if (restartTimeouts[id]) {
    clearTimeout(restartTimeouts[id]);
    delete restartTimeouts[id];
  }

  const started = startChannel(id, false);
  if (started) {
    res.send(`✅ Channel ${id} started (manual mode - no auto-restart)`);
  } else {
    res.send(`❌ Failed to start ${id}`);
  }
});

// 🛑 Stop Stream
app.get("/stop", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  
  stopChannel(id, true);
  res.send(`🛑 Channel ${id} stopped (auto-restart disabled)`);
});

// 🔄 دالة لتشغيل كل القنوات تلقائياً
function startAllChannels() {
  console.log("🚀 بدء تشغيل جميع القنوات تلقائياً...");
  Object.keys(channels).forEach((id, index) => {
    setTimeout(() => {
      startChannel(id, true);
    }, index * 3000); // زيادة الفاصل الزمني بين القنوات
  });
}

// 📊 Status
app.get("/status", (req, res) => {
  const result = {};
  for (const id in channels) {
    result[id] = {
      active: !!ffmpegProcesses[id],
      viewers: viewers[id] || 0,
      autoRestart: !!restartTimeouts[id],
      type: channels[id].type || "unknown",
      restartAttempts: restartAttempts[id] || 0
    };
  }
  res.json(result);
});

// 📡 Dashboard محسّن مع معلومات إضافية
app.get("/dashboard", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard - تشغيل تلقائي محسن</title>
  <style>
    body { font-family: Arial; background:#111; color:#fff; padding:20px; }
    .card { background:#222; padding:15px; margin:10px 0; border-radius:10px; border-left: 4px solid #2ecc71; }
    .card.offline { border-left-color: #e74c3c; }
    .card.restarting { border-left-color: #f39c12; }
    button { padding:8px 12px; margin:5px; cursor:pointer; border:none; border-radius:5px; font-weight:bold; }
    .green { background:#2ecc71; color:#fff; }
    .red { background:#e74c3c; color:#fff; }
    .blue { background:#3498db; color:#fff; }
    .auto { background:#9b59b6; color:#fff; }
    .status-badge { padding:3px 10px; border-radius:15px; font-size:12px; font-weight:bold; }
    .live { background:#2ecc71; }
    .offline { background:#e74c3c; }
    .restarting { background:#f39c12; }
    .type-badge { padding:2px 8px; border-radius:10px; font-size:10px; background:#555; }
    .info { color:#aaa; font-size:12px; margin:5px 0; }
  </style>
</head>
<body>

<h2>📡 Live Dashboard - نسخة محسنة</h2>
<p style="color:#aaa;">✅ دعم كامل لـ TS و M3U8 | تقليل التقطيع | إعادة تشغيل ذكية</p>

<div id="list"></div>

<script>
async function load() {
  try {
    const res = await fetch('/status');
    const data = await res.json();

    const box = document.getElementById('list');
    box.innerHTML = '';

    Object.keys(data).forEach(ch => {
      const d = data[ch];
      const statusClass = d.active ? 'live' : (d.autoRestart ? 'restarting' : 'offline');
      const statusText = d.active ? '🟢 LIVE' : (d.autoRestart ? '🔄 جاري إعادة التشغيل...' : '🔴 OFFLINE');
      const cardClass = d.active ? '' : (d.autoRestart ? 'restarting' : 'offline');
      
      box.innerHTML += "<div class='card " + cardClass + "'>" +
        "<h3>" + ch + 
        " <span class='status-badge " + statusClass + "'>" + statusText + "</span>" +
        " <span class='type-badge'>" + d.type + "</span>" +
        (d.restartAttempts > 0 ? " <span class='status-badge restarting'>🔄 محاولة " + d.restartAttempts + "</span>" : "") +
        "</h3>" +
        "<p>👁️ المشاهدين: <strong>" + d.viewers + "</strong></p>" +
        "<div class='info'>" + 
        (d.active ? '✅ تعمل حالياً' : (d.autoRestart ? '⏳ سيتم إعادة التشغيل تلقائياً' : '❌ متوقفة')) +
        "</div>" +
        "<div style='margin-top:10px;'>" +
        "<a href='/start?id=" + ch + "'><button class='green'>▶️ تشغيل يدوي</button></a>" +
        "<a href='/stop?id=" + ch + "'><button class='red'>⏹ إيقاف</button></a>" +
        "<a href='/restart-auto?id=" + ch + "'><button class='auto'>🔄 تفعيل إعادة التشغيل</button></a>" +
        "</div>" +
        "</div>";
    });
  } catch(e) {
    console.error(e);
  }
}

load();
setInterval(load, 3000);
</script>

</body>
</html>
  `);
});

// إضافة مسار لتفعيل إعادة التشغيل التلقائي
app.get("/restart-auto", (req, res) => {
  const id = req.query.id;
  if (!id) return res.send("❌ missing id");
  if (!channels[id]) return res.send("❌ channel not found");

  if (restartTimeouts[id]) {
    clearTimeout(restartTimeouts[id]);
    delete restartTimeouts[id];
  }

  if (!ffmpegProcesses[id]) {
    startChannel(id, true);
    res.send(`✅ ${id} تم تفعيل إعادة التشغيل التلقائي وبدء التشغيل`);
  } else {
    stopChannel(id, false);
    setTimeout(() => {
      startChannel(id, true);
    }, 1000);
    res.send(`✅ ${id} تم تفعيل إعادة التشغيل التلقائي`);
  }
});

// مسار لعرض حالة مفصلة للقناة
app.get("/channel-status/:id", (req, res) => {
  const id = req.params.id;
  if (!channels[id]) {
    return res.status(404).json({ error: "Channel not found" });
  }
  
  res.json({
    id: id,
    active: !!ffmpegProcesses[id],
    viewers: viewers[id] || 0,
    autoRestart: !!restartTimeouts[id],
    restartAttempts: restartAttempts[id] || 0,
    type: channels[id].type || "unknown",
    input: channels[id].input,
    output: channels[id].output
  });
});

// 🚀 Health check
app.get("/health", (req, res) => {
  const activeChannels = Object.keys(ffmpegProcesses).length;
  res.json({
    status: "OK",
    activeChannels: activeChannels,
    totalChannels: Object.keys(channels).length,
    timestamp: new Date().toISOString()
  });
});

// 🚀 بدء التشغيل
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
  console.log("📊 Dashboard: http://localhost:" + port + "/dashboard");
  
  // 🎯 بدء تشغيل جميع القنوات تلقائياً
  setTimeout(startAllChannels, 3000);
});
