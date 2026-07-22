import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar";
import { Palette } from "./components/Palette";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { ResultsPanel } from "./components/ResultsPanel";

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        <div className="workspace">
          <aside className="sidebar left">
            <Palette />
          </aside>
          <main className="stage">
            <Canvas />
          </main>
          <aside className="sidebar right">
            <Inspector />
            <ResultsPanel />
          </aside>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
