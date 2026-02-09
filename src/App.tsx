import { HashRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { Home } from './pages/Home';
import { SchemaViewer } from './pages/SchemaViewer';

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:shortName" element={<SchemaViewer />} />
        <Route path="/s/:shortName/:stateBase64" element={<SchemaViewer />} />
        <Route path="/schema/:schemaBase64" element={<SchemaViewer />} />
        <Route path="/schema/:schemaBase64/:stateBase64" element={<SchemaViewer />} />
        <Route path="/:example/:state" element={<Home />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
