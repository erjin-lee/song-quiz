import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { NicknamePage } from './pages/NicknamePage';
import { RoomListPage } from './pages/RoomListPage';
import { RoomGamePage } from './pages/RoomGamePage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';

function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<NicknamePage />} />
        <Route path="/rooms" element={<RoomListPage />} />
        <Route path="/rooms/:roomId" element={<RoomGamePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}

export default App;
