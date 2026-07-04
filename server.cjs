var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/proxy-csv", async (req, res) => {
    try {
      const { spreadsheetId, gid } = req.query;
      if (!spreadsheetId) {
        return res.status(400).json({ error: "spreadsheetId is required" });
      }
      const token = req.headers.authorization;
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid || 0}`;
      const headers = {};
      if (token) {
        headers["Authorization"] = token;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Gagal mengunduh CSV dari Google Sheets (Status: ${response.status})`
        });
      }
      const csvData = await response.text();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.send(csvData);
    } catch (error) {
      console.error("Error in proxy-csv:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  async function findRowIndexById(spreadsheetId, id, token) {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:A`,
      {
        headers: { Authorization: token }
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch sheet IDs: ${res.statusText}`);
    }
    const data = await res.json();
    const rows = data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i][0] && rows[i][0].toString().trim() === id.toString().trim()) {
        return i;
      }
    }
    return -1;
  }
  app.post("/api/sheets/create", async (req, res) => {
    try {
      const { spreadsheetId, data } = req.body;
      const token = req.headers.authorization;
      if (!spreadsheetId || !data) {
        return res.status(400).json({ error: "spreadsheetId and data are required" });
      }
      if (!token) {
        return res.status(401).json({ error: "Authorization token is required" });
      }
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:I:append?valueInputOption=USER_ENTERED`;
      const response = await fetch(appendUrl, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values: [[
            data.id,
            data.tanggalInput || "",
            data.tanggalRencanaTayang || "",
            data.petugasInput || "",
            data.verifikator || "",
            data.tanggalEvaluasi || "-",
            data.status || "Pending",
            data.linkDatadukung || "",
            data.catatanRevisi || "-"
          ]]
        })
      });
      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`Gagal menulis data ke Google Sheets: ${errDetail}`);
      }
      const result = await response.json();
      return res.json({ success: true, result });
    } catch (error) {
      console.error("Error in sheets/create:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/sheets/update", async (req, res) => {
    try {
      const { spreadsheetId, id, data } = req.body;
      const token = req.headers.authorization;
      if (!spreadsheetId || !id || !data) {
        return res.status(400).json({ error: "spreadsheetId, id, and data are required" });
      }
      if (!token) {
        return res.status(401).json({ error: "Authorization token is required" });
      }
      const rowIndex = await findRowIndexById(spreadsheetId, id, token);
      if (rowIndex === -1) {
        return res.status(444).json({ error: `ID pengajuan ${id} tidak ditemukan di Google Sheets.` });
      }
      const rowNum = rowIndex + 1;
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${rowNum}:I${rowNum}?valueInputOption=USER_ENTERED`;
      const getRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${rowNum}:I${rowNum}`,
        {
          headers: { Authorization: token }
        }
      );
      let currentRow = [id, "", "", "", "", "-", "Pending", "", "-"];
      if (getRes.ok) {
        const getData = await getRes.json();
        if (getData.values && getData.values[0]) {
          currentRow = getData.values[0];
        }
      }
      if (data.status !== void 0) currentRow[6] = data.status;
      if (data.tanggalEvaluasi !== void 0) currentRow[5] = data.tanggalEvaluasi;
      if (data.catatanRevisi !== void 0) currentRow[8] = data.catatanRevisi;
      if (data.tanggalRencanaTayang !== void 0) currentRow[2] = data.tanggalRencanaTayang;
      if (data.linkDatadukung !== void 0) currentRow[7] = data.linkDatadukung;
      if (data.verifikator !== void 0) currentRow[4] = data.verifikator;
      const response = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values: [currentRow]
        })
      });
      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`Gagal memperbarui baris Google Sheets: ${errDetail}`);
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Error in sheets/update:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/sheets/delete", async (req, res) => {
    try {
      const { spreadsheetId, id } = req.body;
      const token = req.headers.authorization;
      if (!spreadsheetId || !id) {
        return res.status(400).json({ error: "spreadsheetId and id are required" });
      }
      if (!token) {
        return res.status(401).json({ error: "Authorization token is required" });
      }
      const rowIndex = await findRowIndexById(spreadsheetId, id, token);
      if (rowIndex === -1) {
        return res.status(404).json({ error: `ID pengajuan ${id} tidak ditemukan di Google Sheets.` });
      }
      const deleteUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const response = await fetch(deleteUrl, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: 0,
                  // default first tab
                  dimension: "ROWS",
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1
                }
              }
            }
          ]
        })
      });
      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`Gagal menghapus baris dari Google Sheets: ${errDetail}`);
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Error in sheets/delete:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
