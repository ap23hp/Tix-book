import express from "express"

const app=express();
const PORT=Number(process.env.PORT) || 4000;

app.get("/health", (_req,res)=>{
res.status(200).json({status:"ok"})
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});