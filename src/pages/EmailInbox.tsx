import { PageHead, Card } from '@/components/ui';
export default function EmailInbox(){
 return <div><PageHead title="AI Email Inbox" sub="Microsoft Outlook integration — setup required" />
 <Card title="Email integration"><p>The inbox will connect through a secure server-side Microsoft Graph service.</p>
 <p>Approval is required before sending. Live email access is disabled until configuration and testing are complete.</p></Card></div>;
}