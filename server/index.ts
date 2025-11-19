import express from "express";
import cors from "cors";
// Import your parsing logic here
// import { parseResume } from "../resume-parser/parseResume"; // Example

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/parse-resume", async (req: any, res: any) => {
  try {
    const { resumeData } = req.body;
    // const parsed = parseResume(resumeData); // Use your actual parsing function
    // For now, just echo back
    res.json({ parsed: resumeData });
  } catch (err) {
    res.status(500).json({ error: "Failed to parse resume" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});