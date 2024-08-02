import "dotenv/config";

import { createRestAPIClient } from "masto";
import { OpenAI } from "openai";
import fs from "fs";

if (!process.env.URL) {
  throw new Error("URL is missing");
}
if (!process.env.TOKEN) {
  throw new Error("TOKEN is missing");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}

const MAX_TOOT_LENGTH = 666;

const client = createRestAPIClient({
  url: process.env.URL,
  accessToken: process.env.TOKEN,
});

const openai = new OpenAI();

async function createAndSendToot() {
  const { url } = await createToot({
    status: await generateToot(),
    visibility: process.env.VISIBILITY || "direct",
  });
  console.log(`New toot posted: ${url}`);
}

async function createToot(params, retries = 3, backoff = 500) {
  const retryCodes = [408, 500, 502, 503, 504, 522, 524];
  try {
    return client.v1.statuses.create(params);
  } catch (err) {
    console.warn(err.message);
    if (retries > 0 && retryCodes.includes(err.statusCode || 503)) {
      setTimeout(() => {
        return createToot(params, retries - 1, backoff * 2);
      }, backoff);
    } else {
      throw err;
    }
  }
}

async function generateToot() {
  const prompt = fs
    .readFileSync("prompt.txt")
    .toString("utf8")
    .replaceAll("\n", "")
    .replaceAll("  ", " ");
  console.debug("Prompt", prompt);
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: prompt }],
  });
  const tootContent = response.choices[0].message.content;
  console.debug("Toot content", tootContent);
  if (tootContent.length > MAX_TOOT_LENGTH) {
    console.warn(`Toot length exceeds ${MAX_TOOT_LENGTH}c., requesting a new one.`);
    return await generateToot();
  } else {
    return tootContent;
  }
}

createAndSendToot();
