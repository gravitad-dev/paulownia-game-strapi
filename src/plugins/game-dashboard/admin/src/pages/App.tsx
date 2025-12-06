import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './Dashboard';

const App = () => {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
    </Routes>
  );
};

export default App;
