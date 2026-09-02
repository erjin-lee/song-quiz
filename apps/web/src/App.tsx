import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { RoomListPage } from './pages/RoomListPage';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { RoomGamePage } from './pages/RoomGamePage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { NotificationDetailPage } from './pages/NotificationDetailPage';

function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/rooms" element={<RoomListPage />} />
        <Route path="/rooms/new" element={<CreateRoomPage />} />
        <Route path="/rooms/:roomId" element={<RoomGamePage />} />
        <Route
          path="/notifications/:notiId"
          element={<NotificationDetailPage />}
        />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}

export default App;
