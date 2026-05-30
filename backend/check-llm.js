const axios = require("axios");

async function main() {
  const url = "http://127.0.0.1:8080";
  console.log(`Probing LLM server at ${url}...`);
  
  try {
    const res = await axios.get(`${url}/v1/models`, { timeout: 5000 });
    console.log("Status Code:", res.status);
    console.log("Models list:", JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.error("Failed to query /v1/models:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }

  try {
    console.log("Checking general health/root of 8080...");
    const res = await axios.get(url, { timeout: 5000 });
    console.log("Root response:", res.data);
  } catch (error) {
    console.error("Failed to query root:", error.message);
  }
}

main();
