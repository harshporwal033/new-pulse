"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format } from "date-fns";

/* ── Constants ─────────────────────────────────────── */
const API = "http://localhost:3000";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const PALETTE = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
  "#ec4899", "#06b6d4", "#f43f5e", "#84cc16",
];

/* ── Types ─────────────────────────────────────────── */
interface RawTimeline {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  articleCount: number;
}
interface ChartPoint extends RawTimeline {
  start: number;
  impact: number;
  size: number;
}
interface Article {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}
interface ClusterDetail {
  id: string;
  label: string;
  articleCount: number;
  earliestArticleDate: string;
  latestArticleDate: string;
  articles: Article[];
}

/* ── Inline SVG Icons ──────────────────────────────── */
const Spinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);
const ExtIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className="inline ml-1 -mt-px">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/* ══════════════════════════════════════════════════════
   Dashboard Component
   ══════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sources, setSources] = useState({
    "BBC News": true,
    "NPR": true,
    "The Guardian": true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  /* ── Fetch timeline ──────────────────────────────── */
  const loadTimeline = useCallback(async () => {
    try {
      const { data } = await axios.get<RawTimeline[]>(`${API}/timeline?t=${Date.now()}`);
      const cutoff = Date.now() - SEVEN_DAYS;

      const processed = data
        .map((c) => ({
          ...c,
          start: new Date(c.startTime).getTime(),
          impact: c.articleCount,
          size: c.articleCount,
        }))
        .filter((c) => c.start > cutoff)
        .sort((a, b) => a.start - b.start);

      setChartData(processed);
    } catch (err) {
      console.error("Timeline fetch failed", err);
    }
  }, []);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  /* ── Select cluster ──────────────────────────────── */
  const selectCluster = async (id: string) => {
    setActiveId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await axios.get<ClusterDetail>(`${API}/clusters/${id}?t=${Date.now()}`);
      setDetail(data);
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  };

  /* ── Refresh / Ingest ────────────────────────────── */
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("Triggering pipeline…");
    try {
      const { data } = await axios.post(`${API}/ingest/trigger`);
      const poll = setInterval(async () => {
        const res = await axios.get(`${API}/ingest/status/${data.jobId}?t=${Date.now()}`);
        setRefreshMsg(res.data.message || res.data.status);
        if (res.data.status === "completed" || res.data.status === "failed") {
          clearInterval(poll);
          if (res.data.status === "completed") { 
             loadTimeline(); 
             setRefreshMsg("✨ Update complete!");
             setTimeout(() => {
                 setRefreshing(false);
                 setRefreshMsg("");
             }, 3000);
          } else {
             setRefreshing(false);
          }
        }
      }, 1500);
    } catch {
      setRefreshing(false);
      setRefreshMsg("Refresh failed");
    }
  };

  /* ── Source toggle ───────────────────────────────── */
  const toggleSource = (key: string) => {
    setSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /* ── Derived ─────────────────────────────────────── */
  const visibleArticles = useMemo(
    () => detail?.articles.filter((a) => sources[a.source as keyof typeof sources] !== false) ?? [],
    [detail, sources]
  );
  const totalArticles = useMemo(() => chartData.reduce((s, c) => s + c.articleCount, 0), [chartData]);

  /* ── Tooltip ─────────────────────────────────────── */
  const ChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as ChartPoint;
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xl">
        <p className="font-semibold text-gray-900 capitalize text-sm">{d.label}</p>
        <p className="text-blue-600 text-sm mt-1">
          {d.articleCount} {d.articleCount === 1 ? "article" : "articles"}
        </p>
        <p className="text-slate-600 text-xs mt-1">
          {format(new Date(d.startTime), "MMM d, HH:mm")}
        </p>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════ */
  return (
    <div className="h-screen overflow-hidden bg-[#f4f6f9] flex flex-col">

      {/* ── Header ─────────────────────────────────── */}
      <header className="h-16 shrink-0 flex items-center justify-between px-8 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">News Pulse</h1>
          <p className="text-xs text-slate-600 -mt-0.5">
            {chartData.length} clusters · {totalArticles} articles
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium animate-pulse">
              <Spinner />
              {refreshMsg || "Initializing..."}
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors ${refreshing ? 'hidden' : ''}`}
          >
            Refresh Data
          </button>
        </div>
      </header>

      {/* ── 3-Pane Grid ────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5 p-5 flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Sources ─────────────────────────── */}
        <aside className="col-span-2 bg-white rounded-2xl border border-gray-200 p-8 overflow-y-auto flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-6">
            Sources
          </h2>
          <div className="space-y-5">
            {(Object.keys(sources) as Array<keyof typeof sources>).map((source) => (
              <label key={source} className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sources[source]}
                  onChange={() => toggleSource(source)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className={`text-sm font-medium ${sources[source] ? "text-gray-800" : "text-slate-600"} transition-colors`}>
                  {source}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-auto pt-6 border-t border-gray-100">
            <p className="text-xs text-slate-600 leading-relaxed">
              Toggle sources to filter visible clusters.
            </p>
          </div>
        </aside>

        {/* ── Center: Timeline ──────────────────────── */}
        <section className="col-span-7 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Section header with proper padding */}
          <div className="px-8 pt-8 pb-4 shrink-0">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">Timeline</h2>
              <p className="text-xs text-slate-600">
                Y-axis = article count · Bubble size = article count
              </p>
            </div>
          </div>

          {/* Chart area — overflow-hidden keeps it stable */}
          <div className="flex-1 min-h-0 px-8 pb-8">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 24, right: 32, bottom: 24, left: 24 }}>
                  <XAxis
                    type="number"
                    dataKey="start"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={(v: number) => format(new Date(v), "MMM d, HH:mm")}
                    stroke="#d1d5db"
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    tickMargin={10}
                    name="Time"
                    padding={{ left: 40, right: 40 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="impact"
                    name="Articles"
                    stroke="#d1d5db"
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    tickMargin={8}
                    allowDecimals={false}
                    domain={[0, "dataMax + 1"]}
                    padding={{ top: 40, bottom: 20 }}
                    label={{
                      value: "Articles",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9ca3af",
                      fontSize: 13,
                      offset: 16,
                    }}
                  />
                  <ZAxis type="number" dataKey="size" range={[120, 1400]} name="Size" />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Scatter
                    data={chartData}
                    fill="#3b82f6"
                    activeShape={false}
                    style={{ outline: "none" }}
                    onClick={(node: any) => {
                      const id = node?.id ?? node?.payload?.id;
                      if (id) selectCluster(id);
                    }}
                  >
                    {chartData.map((entry, i) => (
                      <Cell
                        key={entry.id}
                        fill={PALETTE[i % PALETTE.length]}
                        stroke={activeId === entry.id ? "#9ca3af" : "transparent"}
                        strokeWidth={activeId === entry.id ? 3 : 0}
                        style={{ outline: "none" }}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                No clusters from the past 7 days.
              </div>
            )}
          </div>
        </section>

        {/* ── Right: Cluster Details ─────────────────── */}
        <aside className="col-span-3 bg-white rounded-2xl border border-gray-200 overflow-y-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-white px-8 pt-8 pb-4 border-b border-gray-100">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">
              Cluster Details
            </h2>
          </div>

          <div className="px-8 py-6">
            {!activeId ? (
              /* ── Empty state ─────────────────────── */
              <div className="flex flex-col items-center justify-center text-center mt-12">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                  </svg>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Click a bubble on the timeline<br />to inspect its articles.
                </p>
              </div>
            ) : detailLoading ? (
              /* ── Loading ─────────────────────────── */
              <div className="flex items-center justify-center gap-2 mt-16 text-slate-600 text-sm">
                <Spinner /> Loading…
              </div>
            ) : detail ? (
              /* ── Content ─────────────────────────── */
              <>
                {/* Cluster summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 mb-6">
                  <h3 className="text-base font-bold text-gray-900 capitalize leading-snug">
                    {detail.label}
                  </h3>
                  <div className="flex justify-between text-xs text-gray-500 mt-3">
                    <span>
                      {detail.articleCount} {detail.articleCount === 1 ? "Article" : "Articles"}
                    </span>
                    <span>{format(new Date(detail.earliestArticleDate), "MMM d, HH:mm")}</span>
                  </div>
                </div>

                {/* Articles */}
                {visibleArticles.length === 0 ? (
                  <p className="text-sm text-slate-600 text-center mt-6">
                    No articles match the active source filters.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {visibleArticles.map((a, i) => (
                      <div
                        key={a.id}
                        className="rounded-xl p-8 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
                        style={{ borderLeftWidth: "4px", borderLeftColor: PALETTE[i % PALETTE.length] }}
                      >
                        <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 leading-snug transition-colors">
                          {a.title}
                        </h4>
                        <div className="flex items-center justify-between mt-3 text-xs">
                          <span className="bg-white border border-gray-200 text-gray-500 px-2.5 py-1 rounded-md font-medium">
                            {a.source}
                          </span>
                          <span className="text-slate-600">
                            {format(new Date(a.publishedAt), "HH:mm")}
                          </span>
                        </div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center mt-3 text-xs font-medium text-blue-600 hover:text-blue-500 transition-colors"
                        >
                          Read original article
                          <ExtIcon />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
