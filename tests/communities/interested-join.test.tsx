import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const {rpc,refresh}=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({rpc:(...args:unknown[])=>{const request=rpc(...args);return {abortSignal:()=>request};}})}));
vi.mock('@/lib/communities/activity',()=>({currentCommunityVisit:()=>null}));
vi.mock('@/lib/communities/celebration-audio',()=>({prepareCelebrationAudio:vi.fn()}));
vi.mock('@/components/events/rsvp-celebration',()=>({RsvpCelebration:({eventTitle}:{eventTitle:string})=><div>Joined {eventTitle}</div>}));
vi.mock('@/components/questionnaire',()=>({QuestionnaireFlow:()=>null}));
import {useRsvpActions,RsvpButton} from '@/components/events/rsvp-button';
import {CommunityRsvpProvider,CommunityRsvpChoice} from '@/components/events/community-rsvp';
function Actions(){const {handleInterested,isPending,confirmedStatus,error}=useRsvpActions('event',true);return <><CommunityRsvpChoice/><button disabled={isPending} onClick={handleInterested}>Interested</button><span>{confirmedStatus}</span>{error&&<p role="alert">{error}</p>}</>;}
function renderActions(){render(<CommunityRsvpProvider eventSlug="event" community={{slug:'professionals',name:'Dalat Professionals'}} initiallyJoin><Actions/></CommunityRsvpProvider>);}
beforeEach(()=>{rpc.mockReset();refresh.mockClear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('saves interested, joins the selected community, hides the choice and celebrates membership',async()=>{
 rpc.mockImplementation(async (name:string)=>({data:{status:name==='join_community'?'joined':'interested'},error:null}));
 renderActions();expect(screen.getByRole('checkbox')).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'Interested'}));
 expect(await screen.findByText('Joined Dalat Professionals')).toBeVisible();expect(screen.queryByRole('checkbox')).toBeNull();
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['mark_interested','join_community']);await waitFor(()=>expect(refresh).toHaveBeenCalled());
});
it('preserves interested and reports a failed community join without celebrating',async()=>{
 rpc.mockImplementation(async (name:string)=>name==='join_community'?{data:null,error:{message:'blocked'}}:{data:{status:'interested'},error:null});
 renderActions();fireEvent.click(screen.getByRole('button',{name:'Interested'}));await screen.findByText('rsvpJoinFailed');
 expect(screen.queryByText('Joined Dalat Professionals')).toBeNull();expect(screen.getByRole('checkbox')).toBeChecked();
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['mark_interested','join_community']);
});

it('updates the confirmed status without waiting for a page refresh',async()=>{
 rpc.mockResolvedValue({data:{status:'interested'},error:null});
 refresh.mockImplementation(()=>new Promise(()=>{}));
 render(<Actions/>);fireEvent.click(screen.getByRole('button',{name:'Interested'}));
 await screen.findByText('interested');await waitFor(()=>expect(screen.getByRole('button',{name:'Interested'})).toBeEnabled());
});
it('releases a stalled request and ignores its late response',async()=>{
 vi.useFakeTimers();let finish!: (value:unknown)=>void;
 rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<Actions/>);fireEvent.click(screen.getByRole('button',{name:'Interested'}));
 expect(screen.getByRole('button',{name:'Interested'})).toBeDisabled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});
 expect(screen.getByRole('button',{name:'Interested'})).toBeEnabled();expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm');
 await act(async()=>{finish({data:{status:'interested'},error:null});});
 expect(screen.queryByText('interested')).toBeNull();vi.useRealTimers();
});

it('keeps action labels visible while saving and shows Interested immediately after confirmation',async()=>{
 let finish!: (value:unknown)=>void;rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<RsvpButton eventId="event" eventSlug="event" capacity={null} goingSpots={0} currentRsvp={null} isLoggedIn waitlistPosition={null} startsAt="2040-09-17T03:00:00Z" endsAt={null}/>);
 fireEvent.click(screen.getByRole('button',{name:'interested'}));
 expect(screen.getByRole('button',{name:'interested'})).toBeDisabled();expect(screen.getByRole('button',{name:'imGoing'})).toBeVisible();expect(screen.queryByText('...')).toBeNull();
 await act(async()=>{finish({data:{status:'interested'},error:null});});
 expect(screen.getByText('youreInterested')).toBeVisible();expect(screen.getByRole('button',{name:'imGoing'})).toBeEnabled();
});
