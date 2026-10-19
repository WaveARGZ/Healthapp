// Only loaded by the subprocess integration test; unexpected requests fail.
import { appendFile, readFile } from "node:fs/promises";
const folder = process.env.BODYMAKE_COMMONS_TEST_DIR;
if (!folder) throw new Error("This fetch fixture requires a test directory");
const picture = (id) => ({ pageid: id, title: `File:White rice ${id}.png`, imageinfo: [{
  url: `https://upload.wikimedia.org/fixture/${id}.png`, mime: "image/png", width: 192, height: 192,
  extmetadata: { LicenseShortName: { value: "CC0" }, ImageDescription: { value: "A bowl of white rice" } },
}] });
globalThis.fetch = async (value) => {
  const url = new URL(value);
  await appendFile(`${folder}/requests.log`, `${url}\n`);
  if (url.hostname === "commons.wikimedia.org" && url.pathname === "/w/api.php") {
    if (url.searchParams.get("gcmtitle") !== "Category:Cooked rice") return Response.json({ query: { pages: {} } });
    return Response.json({
      query: { pages: { 17: picture(17), 18: picture(18) } },
      ...(!url.searchParams.has("gcmcontinue") ? { continue: { continue: "gcmcontinue||", gcmcontinue: "fixture|next" } } : {}),
    });
  }
  if (url.hostname === "upload.wikimedia.org" && /^\/fixture\/(17|18)\.png$/.test(url.pathname)) return new Response(await readFile(`${folder}/${url.pathname.endsWith("17.png") ? "first" : "second"}.png`));
  throw new Error(`Unexpected fixture request: ${url}`);
};
