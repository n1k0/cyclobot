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
  // Toot text
  const tootText = await generateTootText();
  // Image
  const imageUrl = await generateTootImage(tootText);
  const remoteFile = await fetch(imageUrl);
  const attachment = await client.v2.media.create({
    file: await remoteFile.blob(),
    description: "Illustration générée des technologies mentionnées dans le pouet.",
  });
  const { url } = await createToot({
    status: tootText,
    visibility: process.env.VISIBILITY || "direct",
    mediaIds: [attachment.id],
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

async function generateTootImage(toot) {
  const imagePrompt = `Est-ce que tu peux me produire une image d'illustration pas trop science-fiction et plutôt crédible et réaliste pour ce message que tu as généré : “${toot}”. Surtout, évite ABSOLUMENT et IMPÉRATIVEMENT de positionner le moindre texte sur l'image générée.`;
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: imagePrompt,
    n: 1,
    quality: "hd",
    size: "1792x1024",
  });
  return response.data[0].url;
}

async function generateTootText() {
  const prompt = fs.readFileSync("prompt.txt").toString("utf8");
  console.debug("Prompt", prompt);
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: prompt }],
  });
  const tootContent = response.choices[0].message.content.replaceAll("*", "");
  console.debug("Toot content", tootContent);
  if (tootContent.length > MAX_TOOT_LENGTH) {
    console.warn(`Toot length exceeds ${MAX_TOOT_LENGTH}c., requesting a new one.`);
    return await generateTootText();
  } else {
    return tootContent;
  }
}

createAndSendToot();
