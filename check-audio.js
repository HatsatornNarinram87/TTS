const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');

const proc = spawn(ffmpegPath, [
  '-list_devices', 'true',
  '-f', 'dshow',
  '-i', 'dummy'
]);

let output = '';
proc.stderr.on('data', (data) => {
  console.log(data.toString());
});

proc.on('close', () => {
  const lines = output.split('\n');
  const audioDevices = lines.filter(l => 
    l.includes('"') && 
    lines[lines.indexOf(l) - 1]?.includes('audio')  ||
    l.includes('(audio)')
  );
  
  console.log('=== Audio Devices ===');
  // แสดงทุก line ที่มีชื่อ device
  lines.forEach(line => {
    if (line.includes('"')) console.log(line.trim());
  });
});