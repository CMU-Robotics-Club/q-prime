import Announcements from './Annoucements';
import QueueStats from './QueueStats';
import SelfServeNotice from './SelfServeNotice';

function SharedMain() {
  return (
    <div>
      <Announcements />
      <QueueStats />
      <SelfServeNotice />
    </div>
  );
}

export default SharedMain;
