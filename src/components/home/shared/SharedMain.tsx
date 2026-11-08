import Announcements from './Annoucements';
import PrinterStatus from './PrinterStatus';
import QueueStats from './QueueStats';
import SelfServeNotice from './SelfServeNotice';

function SharedMain() {
  return (
    <div>
      <Announcements />
      <QueueStats />
      <SelfServeNotice />
      <PrinterStatus />
    </div>
  );
}

export default SharedMain;
