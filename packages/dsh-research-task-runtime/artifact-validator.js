import {parseHomeWorkbenchStudySpec} from './home-workbench-study-contract.js';
import {financialWidgetSpec} from './financial-widget-contract.js';
import {boardTabsSpec} from './board-tabs-contract.js';
import {parseAttachmentSpec} from './attachment-template-contract.js';
import {parseDerivedSpec} from './derived-template-contract.js';
import {parseAudioSpec} from './audio-template-contract.js';
import {parseYoutubeSpec} from './youtube-template-contract.js';
import {parseIframeSpec} from './iframe-template-contract.js';
// Host-side acceptance uses the same schema as the canvas parser. Covered by parity tests.
import { MAX_RESEARCH_HTML_BYTES } from "./html-artifact.js";
const RESEARCH_CONTAINER_MAX_MARKDOWN = 32e3;
const RESEARCH_CONTAINER_TYPES = new Set(["research-study","board-tabs","calendar-tool","financial-widget","files","gallery","audio","summary","youtube","iframe","web","chart","table","kpi","markdown","mind-map","html"]);
		function normalizeResearchWebUrl(value) {
			if (typeof value !== "string") return null;
			const source = value.trim().replace(/^(https?:\/\/)(?:(?:%0[9a-d])|%20|[\u0009-\u000d\u0020])+/i, "$1");
			if (source.length === 0 || source.length > 8192) return null;
			try {
				const Url = typeof globalThis.URL === "function" ? globalThis.URL : globalThis.window?.URL;
				if (typeof Url !== "function") return null;
				const url = new Url(source);
				if (url.protocol !== "http:" && url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
				url.hostname = url.hostname.toLowerCase();
				if (url.protocol === "https:" && url.port === "443" || url.protocol === "http:" && url.port === "80") url.port = "";
				return url.href;
			} catch {
				return null;
			}
		}
		function researchContainerExactKeys(value, required, optional = []) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
			const keys = Object.keys(value);
			if (required.some((key) => !keys.includes(key))) return false;
			return keys.every((key) => required.includes(key) || optional.includes(key));
		}
		function researchContainerText(value, limit, allowEmpty = false) {
			if (typeof value !== "string" || value.length > limit) return null;
			const text = value.trim();
			return text === "" && !allowEmpty ? null : value;
		}
		function researchContainerScalar(value) {
			if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : null;
			return researchContainerText(value, 512);
		}
		function stripResearchContainerFence(value) {
			const source = value.trim();
			const match = source.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
			return match?.[1]?.trim() ?? source;
		}
		function parseResearchContainerSpec(raw) {
			let value = raw;
			try {
				if (typeof raw === "string") value = JSON.parse(stripResearchContainerFence(raw));
			} catch {
				return null;
			}
			if (typeof value !== "object" || value === null || Array.isArray(value) || value.version !== 1 || !RESEARCH_CONTAINER_TYPES.has(value.type)) return null;
			const title = researchContainerText(value.title, 256);
			if (title === null) return null;
			if (value.type === "research-study") return parseHomeWorkbenchStudySpec(value);
			if (value.type === "financial-widget") return financialWidgetSpec(value);
			if (value.type === "board-tabs") return boardTabsSpec(value);
			if (value.type === "calendar-tool") return researchContainerExactKeys(value,["version","type","title"]) ? Object.freeze({version:1,type:"calendar-tool",title}) : null;
			if (value.type === "html") {
				if (!researchContainerExactKeys(value, ["version", "type", "title", "html"]) || typeof value.html !== "string" || !value.html.trim() || new TextEncoder().encode(value.html).byteLength > MAX_RESEARCH_HTML_BYTES || /<(?:iframe|frame|object|embed)\b/i.test(value.html)) return null;
				return Object.freeze({ version: 1, type: "html", title, html: value.html });
			}
			if (value.type === "summary" || value.type === "mind-map" && Object.hasOwn(value,'source')) return parseDerivedSpec(value);
			if (value.type === "youtube") return parseYoutubeSpec(value);
			if (value.type === "files" || value.type === "gallery") return parseAttachmentSpec(value);
			if (value.type === "audio") return parseAudioSpec(value);
			if (value.type === "iframe") return parseIframeSpec(value);
			if (value.type === "web") {
				if (!researchContainerExactKeys(value, ["version", "type", "title", "url"], ["description"])) return null;
				const url = normalizeResearchWebUrl(value.url);
				const description = value.description === void 0 ? void 0 : researchContainerText(value.description, 1024);
				return url === null || value.description !== void 0 && description === null ? null : Object.freeze({ version: 1, type: "web", title, url, ...(description === void 0 ? {} : { description }) });
			}
			if (value.type === "chart") {
				if (!researchContainerExactKeys(value, ["version", "type", "title", "variant", "labels", "series"]) || value.variant !== "bar" && value.variant !== "line" || !Array.isArray(value.labels) || value.labels.length < 1 || value.labels.length > 24 || !Array.isArray(value.series) || value.series.length < 1 || value.series.length > 6) return null;
				const labels = value.labels.map((label) => researchContainerText(label, 128));
				if (labels.some((label) => label === null)) return null;
				const series = [];
				for (const item of value.series) {
					if (!researchContainerExactKeys(item, ["name", "values"]) || !Array.isArray(item.values) || item.values.length !== labels.length) return null;
					const name = researchContainerText(item.name, 128);
					const values = item.values.map((entry) => typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 1e15 ? entry : null);
					if (name === null || values.some((entry) => entry === null)) return null;
					series.push(Object.freeze({ name, values: Object.freeze(values) }));
				}
				return Object.freeze({ version: 1, type: "chart", title, variant: value.variant, labels: Object.freeze(labels), series: Object.freeze(series) });
			}
			if (value.type === "table") {
				if (!researchContainerExactKeys(value, ["version", "type", "title", "columns", "rows"]) || !Array.isArray(value.columns) || value.columns.length < 1 || value.columns.length > 12 || !Array.isArray(value.rows) || value.rows.length > 100) return null;
				const columns = value.columns.map((column) => researchContainerText(column, 128));
				if (columns.some((column) => column === null)) return null;
				const rows = [];
				for (const row of value.rows) {
					if (!Array.isArray(row) || row.length !== columns.length) return null;
					const cells = row.map(researchContainerScalar);
					if (cells.some((cell) => cell === null)) return null;
					rows.push(Object.freeze(cells));
				}
				return Object.freeze({ version: 1, type: "table", title, columns: Object.freeze(columns), rows: Object.freeze(rows) });
			}
			if (value.type === "kpi") {
				if (!researchContainerExactKeys(value, ["version", "type", "title", "items"]) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return null;
				const items = [];
				for (const item of value.items) {
					if (!researchContainerExactKeys(item, ["label", "value"], ["change"])) return null;
					const label = researchContainerText(item.label, 128);
					const result = researchContainerScalar(item.value);
					const change = item.change === void 0 ? void 0 : researchContainerScalar(item.change);
					if (label === null || result === null || item.change !== void 0 && change === null) return null;
					items.push(Object.freeze({ label, value: result, ...(change === void 0 ? {} : { change }) }));
				}
				return Object.freeze({ version: 1, type: "kpi", title, items: Object.freeze(items) });
			}
			if (!researchContainerExactKeys(value, ["version", "type", "title", "content"])) return null;
			const content = researchContainerText(value.content, RESEARCH_CONTAINER_MAX_MARKDOWN);
			return content === null || value.type === "mind-map" && !/^\s*#\s+.+\n[\s\S]*?[-*+]\s+/u.test(content) ? null : Object.freeze({ version: 1, type: value.type, title, content });
		}

export { parseResearchContainerSpec };
