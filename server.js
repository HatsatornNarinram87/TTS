const express = require("express");
const { speakAndRecord } = require("./audio");
const axios = require("axios");
const app = express();

app.use(express.json());

app.post("/voice", async (req, res) => {
  const data = req.body;
  console.log("Received:", data);
  for (let i = 1; i < data.length; i++) {
    console.log("Processing:", data[i].text);
    const result = await speakAndRecord(data[i].text, i % 2 === 0 ? 3 : 5);
    console.log("Result:", result);
  }


  // axios.get("http://localhost:4000/receive");

  res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});