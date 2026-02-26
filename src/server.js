require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./db/dbConnect");

const PORT = process.env.PORT || 4000;

(async () => {
    try {
        console.log("Connect Database..."); 
        
        await connectDB();
        
        app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
    } catch (error) {
        console.error("Error connecting to the database:", error.message);
        process.exit(1);
    }
})();