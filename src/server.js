require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./db/dbConnect");

const PORT = process.env.PORT || 4000;

(async () => {
    await connectDB();
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
})();
