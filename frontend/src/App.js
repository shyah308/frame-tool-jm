import React, { useRef, useState, useEffect } from "react";
import {
  Button, Select, MenuItem, Box, Typography, Grid,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress,
  TextField, FormControl, InputLabel, Slider, IconButton
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const behaviors = ["jumping", "unsupported rearing", "supported rearing", "grooming", "freezing", "etc"];
const rowsPerPage = 15;

function App() {
  const [intervals, setIntervals] = useState([]);
  const [intervalStartFrame, setIntervalStartFrame] = useState("");
  const [intervalEndFrame, setIntervalEndFrame] = useState("");
  const [intervalBehavior, setIntervalBehavior] = useState(behaviors[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [page, setPage] = useState(0);
  const [frameRate, setFrameRate] = useState(30); // Default FPS set to 30
  const [frameInterval, setFrameInterval] = useState(100); // Frame transition interval in ms
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const currentFrameRef = useRef(0);
  const [markStart, setMarkStart] = useState(null);
  const [isAddingInterval, setIsAddingInterval] = useState(false);
  const [themeMode, setThemeMode] = useState("light");
  const [arrowPressed, setArrowPressed] = useState(null);

  const videoRef = useRef(null);
  const frameIntervalRef = useRef(null);

  const theme = createTheme({
    palette: {
      mode: themeMode,
      ...(themeMode === "dark" ? {
        background: { default: "#121212", paper: "#1e1e1e" },
        text: { primary: "#d2d2d2ff" },
        primary: { main: "#e7657cff" },
      } : {
        background: { default: "#ffffff", paper: "#ffffff" },
        text: { primary: "#000000" },
        primary: { main: "#e7657cff" },
      }),
    },
  });

  const toggleTheme = () => {
    setThemeMode(prev => (prev === "light" ? "dark" : "light"));
  };

  async function onFileChange(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      alert("Please select a video.");
      return;
    }
    setIsUploading(true);
    setIsConverting(true);

    const file = files[0];
    if (!file.type.startsWith("video/")) {
      alert("Only video files can be uploaded.");
      setIsUploading(false);
      setIsConverting(false);
      return;
    }
    console.log("Video file uploaded:", file.name, "Type:", file.type);

    const fd = new FormData();
    fd.append("video", file);
    try {
      const res = await fetch("http://localhost:5000/process-video", {
        method: "POST",
        body: fd,
      }).then(res => res.json());
      if (res.status === "error") {
        alert(`Video processing failed: ${res.msg}`);
        setIsUploading(false);
        setIsConverting(false);
        return;
      }
      setVideoUrl(res.converted_url);
      setCurrentTime(0);
      setCurrentFrame(0);
      currentFrameRef.current = 0;
      setIntervals([]);
      setMarkStart(null);
      setIntervalStartFrame("");
      setIntervalEndFrame("");
      setPage(0);
    } catch (error) {
      alert(`Video processing failed: ${error.message}`);
      setIsUploading(false);
      setIsConverting(false);
    }
    setIsUploading(false);
    setIsConverting(false);
  }

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      console.log("Setting video src:", videoUrl);
      videoRef.current.src = videoUrl;
      videoRef.current.load();
      videoRef.current.onloadedmetadata = () => {
        console.log("Video metadata loaded, duration:", videoRef.current.duration);
        setVideoDuration(videoRef.current.duration);
      };
      videoRef.current.onerror = (e) => {
        console.error("Video error:", e);
        alert("Video playback failed: Please check the converted MP4 file.");
      };
    }
    return () => {
      if (videoRef.current) {
        console.log("Cleaning up videoRef");
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      e.preventDefault();
      if (isAddingInterval) return;
      if (e.code === "KeyS") {
        markIntervalStart();
      } else if (e.code === "KeyE") {
        markIntervalEnd();
      } else if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].includes(e.code)) {
        const behaviorIndex = parseInt(e.code.replace("Digit", "")) - 1;
        if (behaviorIndex < behaviors.length && markStart !== null && intervalEndFrame !== "") {
          setIsAddingInterval(true);
          const selectedBehavior = behaviors[behaviorIndex];
          console.log(`Behavior selected and interval added: ${selectedBehavior}`);
          setIntervalBehavior(selectedBehavior);
          addInterval(selectedBehavior);
        }
      } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        setArrowPressed(e.code);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        setArrowPressed(null);
        if (markStart !== null) {
          markIntervalEnd();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [markStart, intervalEndFrame, isAddingInterval]);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    if (arrowPressed) {
      const moveFrame = () => {
        if (!videoRef.current) return;
        const direction = arrowPressed === "ArrowRight" ? 1 : -1;
        const newFrame = currentFrameRef.current + direction;
        const newTime = newFrame / frameRate;
        if (newTime >= 0 && newTime <= videoDuration) {
          setCurrentTime(newTime);
          setCurrentFrame(newFrame);
          currentFrameRef.current = newFrame;
          videoRef.current.currentTime = newTime;
          console.log(`Moved to frame: ${newFrame}, time: ${newTime.toFixed(2)}s`);
        }
        frameIntervalRef.current = setTimeout(moveFrame, frameInterval);
      };
      frameIntervalRef.current = setTimeout(moveFrame, frameInterval);
    } else {
      if (frameIntervalRef.current) {
        clearTimeout(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }
    return () => {
      if (frameIntervalRef.current) {
        clearTimeout(frameIntervalRef.current);
      }
    };
  }, [arrowPressed, frameRate, videoDuration, frameInterval]);

  useEffect(() => {
    if (isAddingInterval) {
      setIsAddingInterval(false);
    }
  }, [intervals]);

  function handleTimeUpdate() {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    const newFrame = Math.round(time * frameRate);
    setCurrentFrame(newFrame);
    currentFrameRef.current = newFrame;
  }

  function handleSliderChange(event, newValue) {
    const newTime = newValue / frameRate;
    setCurrentTime(newTime);
    setCurrentFrame(newValue);
    currentFrameRef.current = newValue;
    if (videoRef.current) {
      console.log("Slider changed, setting video frame:", newValue);
      videoRef.current.currentTime = newTime;
    }
  }

  function moveNextFrame() {
    const newFrame = currentFrame + 1;
    const newTime = newFrame / frameRate;
    if (newTime <= videoDuration) {
      setCurrentTime(newTime);
      setCurrentFrame(newFrame);
      currentFrameRef.current = newFrame;
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        console.log(`Next frame: ${newFrame}, time: ${newTime.toFixed(2)}s`);
      }
    }
  }

  function movePrevFrame() {
    const newFrame = currentFrame - 1;
    const newTime = newFrame / frameRate;
    if (newTime >= 0) {
      setCurrentTime(newTime);
      setCurrentFrame(newFrame);
      currentFrameRef.current = newFrame;
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        console.log(`Previous frame: ${newFrame}, time: ${newTime.toFixed(2)}s`);
      }
    }
  }

  function markIntervalStart() {
    setMarkStart(currentFrameRef.current);
    setIntervalStartFrame(currentFrameRef.current);
    setIntervalEndFrame("");
    console.log("Interval start marked:", currentFrameRef.current);
  }

  function markIntervalEnd() {
    if (markStart === null) {
      alert("Please mark the start frame first.");
      return;
    }
    setIntervalEndFrame(currentFrameRef.current);
    console.log("Interval end updated:", currentFrameRef.current);
  }

  function addInterval(behavior) {
    const startFrame = parseInt(intervalStartFrame);
    const endFrame = parseInt(intervalEndFrame);
    const startTime = startFrame / frameRate;
    const endTime = endFrame / frameRate;
    const maxFrame = Math.round(videoDuration * frameRate);
    if (isNaN(startFrame) || isNaN(endFrame)) {
      alert("Start and end frames must be valid numbers.");
      setIsAddingInterval(false);
      return;
    }
    if (startFrame < 0 || endFrame > maxFrame) {
      alert(`Frames must be between 0 and ${maxFrame}.`);
      setIsAddingInterval(false);
      return;
    }
    if (startFrame >= endFrame) {
      alert("Start frame must be less than end frame.");
      setIsAddingInterval(false);
      return;
    }
    setIntervals(prev => [
      ...prev,
      { start: startFrame, end: endFrame, startTime, endTime, behavior, auto: false },
    ]);
    setIntervalStartFrame("");
    setIntervalEndFrame("");
    setIntervalBehavior(behaviors[0]);
    setMarkStart(null);
    setPage(0);
    console.log("Interval added:", { start: startFrame, end: endFrame, startTime, endTime, behavior });
  }

  function updateIntervalBehavior(idx, newBehavior) {
    setIntervals(prev =>
      prev.map((interval, i) =>
        i === idx ? { ...interval, behavior: newBehavior } : interval
      )
    );
    console.log("Interval behavior updated:", { idx, behavior: newBehavior });
  }

  function removeInterval(idx) {
    setIntervals(intervals.filter((_, i) => i !== idx));
    if (page * rowsPerPage >= intervals.length - 1) {
      setPage(Math.max(0, page - 1));
    }
  }

  function downloadCsvAll() {
    const zip = new JSZip();
    const intervalData = intervals.map(i => ({
      type: "interval",
      start_time: i.startTime.toFixed(2),
      end_time: i.endTime.toFixed(2),
      start_frame: i.start,
      end_frame: i.end,
      behavior: i.behavior,
    }));
    const intervalCsv = Papa.unparse(intervalData);
    zip.file("interval_summary.csv", intervalCsv);
    zip.generateAsync({ type: "blob" }).then(blob => {
      saveAs(blob, "behavior_labels.zip");
    });
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ p: 2, bgcolor: 'background.default', color: 'text.primary' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" gutterBottom>Behavior Labeling Tool</Typography>
          <IconButton onClick={toggleTheme} color="inherit" aria-label="Toggle theme">
            {themeMode === "light" ? <Brightness4Icon /> : <Brightness7Icon />}
          </IconButton>
        </Box>
        <Box sx={{ my: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box>
            <Typography variant="body2" gutterBottom>Select Video</Typography>
            <input
              type="file"
              accept="video/*"
              onChange={onFileChange}
              disabled={isConverting}
              aria-label="Select video file"
            />
            {isConverting && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Converting video...</Typography>
              </Box>
            )}
          </Box>
          <TextField
            label="Frame Rate (FPS)"
            type="number"
            value={frameRate}
            onChange={(e) => {
              const value = e.target.value;
              console.log("Frame Rate input:", value);
              if (value === "") {
                setFrameRate("");
              } else {
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && numValue >= 1) {
                  setFrameRate(value);
                }
              }
            }}
            onBlur={() => {
              let numValue = parseFloat(frameRate);
              if (isNaN(numValue) || numValue < 1) {
                console.log("Frame Rate reset to default: 30");
                setFrameRate(30);
              } else {
                setFrameRate(numValue);
              }
            }}
            size="small"
            inputProps={{ min: 1, step: 1 }}
            aria-label="Frame rate"
          />
          <TextField
            label="Frame Interval (ms)"
            type="number"
            value={frameInterval}
            onChange={(e) => {
              const value = e.target.value;
              console.log("Frame Interval input:", value);
              if (value === "") {
                setFrameInterval("");
              } else {
                const numValue = parseInt(value);
                if (!isNaN(numValue) && numValue >= 10) {
                  setFrameInterval(value);
                }
              }
            }}
            onBlur={() => {
              let numValue = parseInt(frameInterval);
              if (isNaN(numValue) || numValue < 10) {
                console.log("Frame Interval reset to default: 100");
                setFrameInterval(100);
              } else {
                setFrameInterval(numValue);
              }
            }}
            size="small"
            inputProps={{ min: 10, step: 1 }}
            aria-label="Frame transition interval"
          />
          <Button
            onClick={downloadCsvAll}
            variant="contained"
            color="primary"
            aria-label="Save CSV"
          >
            Save CSV
          </Button>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="h6">Video</Typography>
            {!videoUrl ? (
              <Box
                sx={{
                  width: "100%",
                  maxWidth: "800px",
                  height: "450px",
                  backgroundColor: themeMode === "dark" ? "#333" : "#e0e0e0",
                  border: "1px solid #ccc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: themeMode === "dark" ? "#bbb" : "#666",
                  fontSize: "1.2rem",
                  borderRadius: "4px",
                }}
                aria-label="Video placeholder"
              >
                Please upload a video
              </Box>
            ) : (
              <video
                ref={videoRef}
                width="100%"
                style={{ maxWidth: "800px", border: "1px solid #ccc", borderRadius: "4px" }}
                onTimeUpdate={handleTimeUpdate}
              />
            )}
            {videoUrl && (
              <>
                <Box sx={{ display: 'flex', gap: 2, mt: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    onClick={movePrevFrame}
                    aria-label="Previous frame"
                  >
                    Prev Frame
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={moveNextFrame}
                    aria-label="Next frame"
                  >
                    Next Frame
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={markIntervalStart}
                    aria-label="Mark start frame"
                  >
                    Mark Start (S)
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={markIntervalEnd}
                    aria-label="Mark end frame"
                  >
                    Mark End (E)
                  </Button>
                  <Typography>
                    Current Frame: {currentFrame} / {Math.round(videoDuration * frameRate)}
                  </Typography>
                </Box>
                <Slider
                  value={currentFrame}
                  min={0}
                  max={Math.round(videoDuration * frameRate)}
                  step={1}
                  onChange={handleSliderChange}
                  aria-label="Video frame timeline"
                  sx={{ mt: 2 }}
                />
              </>
            )}
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ p: 2, border: '1px solid #ccc', borderRadius: 1, bgcolor: 'background.paper', height: '100%' }}>
              <Typography variant="h6" gutterBottom>Behavior Intervals</Typography>
              <Typography variant="body2" gutterBottom>
                Shortcuts: ArrowRight/ArrowLeft to navigate and mark end, S to mark start, E to update end, 1-6 to select behavior and add interval
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                <TextField
                  label="Start Frame"
                  type="number"
                  value={intervalStartFrame}
                  onChange={(e) => {
                    const v = e.target.value;
                    console.log("Start Frame input:", v);
                    setIntervalStartFrame(v);
                    if (v !== "") setMarkStart(Number(v));
                    else setMarkStart(null);
                  }}
                  size="small"
                  inputProps={{ min: 0, step: 1 }}
                  aria-label="Interval start frame"
                />
                <TextField
                  label="End Frame"
                  type="number"
                  value={intervalStartFrame !== "" ? intervalEndFrame : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    console.log("End Frame input:", v);
                    setIntervalEndFrame(v);
                  }}
                  size="small"
                  inputProps={{ min: intervalStartFrame !== "" ? Number(intervalStartFrame) : 0, step: 1 }}
                  aria-label="Interval end frame"
                  disabled={intervalStartFrame === ""}
                />
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Behavior</InputLabel>
                  <Select
                    value={intervalBehavior}
                    label="Behavior"
                    onChange={(e) => setIntervalBehavior(e.target.value)}
                  >
                    {behaviors.map((b, i) => (
                      <MenuItem key={b} value={b}>{`${b} (${i + 1})`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  onClick={() => addInterval(intervalBehavior)}
                  variant="contained"
                  aria-label="Add interval"
                  disabled={intervalStartFrame === "" || intervalEndFrame === ""}
                >
                  Add
                </Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Interval (Frame)</TableCell>
                    <TableCell>Behavior</TableCell>
                    <TableCell>Delete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {intervals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        No intervals added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    intervals
                      .slice()
                      .sort((a, b) => b.start - a.start)
                      .slice(page * rowsPerPage, (page + 1) * rowsPerPage)
                      .map((interval, i) => (
                        <TableRow key={i}>
                          <TableCell>{`${interval.start} - ${interval.end}`}</TableCell>
                          <TableCell>
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                              <InputLabel>Behavior</InputLabel>
                              <Select
                                value={interval.behavior}
                                label="Behavior"
                                onChange={(e) => updateIntervalBehavior(intervals.indexOf(interval), e.target.value)}
                              >
                                {behaviors.map((b, j) => (
                                  <MenuItem key={b} value={b}>{`${b} (${j + 1})`}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => removeInterval(intervals.indexOf(interval))}
                              aria-label={`Delete interval ${i + 1}`}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
              {intervals.length > rowsPerPage && (
                <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                  <Button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    variant="outlined"
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * rowsPerPage >= intervals.length}
                    variant="outlined"
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                  <Typography>
                    Page {page + 1} / {Math.ceil(intervals.length / rowsPerPage)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}

export default App;