import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {useState} from 'react';
vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key}));
vi.mock('@/components/events/community-rsvp',()=>({CommunityRsvpChoice:()=>null}));
vi.mock('@/components/questionnaire',()=>({QuestionnaireFlow:()=>null}));
vi.mock('@/components/events/rsvp-celebration',()=>({RsvpCelebration:({onComplete}:{onComplete:()=>void})=><button onClick={onComplete}>Fireworks</button>}));
vi.mock('@/components/events/rsvp-button',()=>({
 isEventPast:()=>false,
 useCelebration:()=>{const [isCelebrating,setCelebrating]=useState(false);return {isCelebrating,setCelebrating,isRsvpCardVisible:false};},
 useRsvpActions:(_id:string,_logged:boolean,success:()=>void)=>({isPending:false,handleRsvp:success,handleCancel:()=>{},performRsvp:success,hasActiveQuestionnaire:false})
}));
import {FloatingRsvpBar} from '@/components/events/floating-rsvp-bar';
afterEach(cleanup);
describe('mobile RSVP celebration',()=>{
 it('keeps fireworks mounted while hiding its own floating action bar',()=>{
 render(<FloatingRsvpBar eventId="test" eventSlug="test" eventTitle="Test" eventDescription={null} eventImageUrl={null} capacity={null} goingSpots={0} currentRsvp={null} isLoggedIn waitlistPosition={null} startsAt="2040-09-17T03:00:00Z" endsAt={null}/>);
 fireEvent.click(screen.getByRole('button',{name:'imGoing'}));
 expect(screen.getByRole('button',{name:'Fireworks'})).toBeVisible();
 expect(screen.queryByRole('button',{name:'imGoing'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Fireworks'}));
 expect(screen.queryByRole('button',{name:'Fireworks'})).toBeNull();
 expect(screen.getByRole('button',{name:'imGoing'})).toBeVisible();
 });
});
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
vi.mock('@/lib/communities/activity',()=>({trackCommunityActivity:vi.fn(),currentCommunityVisit:()=>null}));
vi.mock('@/lib/communities/celebration-audio',()=>({prepareCelebrationAudio:vi.fn()}));
import {JoinTribeButton} from '@/components/tribes/join-tribe-button';
import type {Tribe} from '@/lib/types';
const tribe={id:'test',slug:'test',name:'Test community',access_type:'public',description:'Welcome'} as Tribe;
describe('community join celebration',()=>{
 it('celebrates a successful join before refreshing away the button',async()=>{
 refresh.mockClear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'joined'})}));
 render(<JoinTribeButton tribe={tribe} pendingRequest={null} isAuthenticated/>);
 fireEvent.click(screen.getByRole('button',{name:'joinTribe'}));
 expect(await screen.findByRole('button',{name:'Fireworks'})).toBeVisible();
 expect(refresh).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Fireworks'}));expect(refresh).toHaveBeenCalledOnce();
 vi.unstubAllGlobals();
 });
 it('does not celebrate a failed join',async()=>{
 refresh.mockClear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Join failed'})}));
 render(<JoinTribeButton tribe={tribe} pendingRequest={null} isAuthenticated/>);
 fireEvent.click(screen.getByRole('button',{name:'joinTribe'}));await screen.findByText('Join failed');
 expect(screen.queryByRole('button',{name:'Fireworks'})).toBeNull();expect(refresh).not.toHaveBeenCalled();vi.unstubAllGlobals();
 });
});
