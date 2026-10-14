import TrainingZones from '../components/TrainingZones';

export const metadata = {
  title: 'Training zones | Natrix',
};

export default function TrainingZonesPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#F4F9FD', padding: '24px 0' }}>
      <TrainingZones />
    </main>
  );
}
