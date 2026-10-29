import Friends from '@/components/Friends';
import Footer from '@/components/Footer';
import styles from './friends.module.css';

export const metadata = {
  title: 'Friends — Lonely',
  description: '友链',
};

export default function FriendsPage() {
  return (
    <>
      <div className={styles.stage}>
        <Friends />
      </div>
      <Footer />
    </>
  );
}
