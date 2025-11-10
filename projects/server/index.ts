import express, { Application } from "express";

const app: Application = express();
const port = process.env["PORT"] ?? 8000;

app.get("/", (req, res) => {
    res.send("Hello, World!");
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
