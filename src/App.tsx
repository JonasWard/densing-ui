import { HashRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { Home } from './pages/Home';

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/schema/:schemaBase64" element={<Home />} />
        <Route path="/:example/:state" element={<Home />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
