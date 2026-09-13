import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const {rpc,refresh}=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({rpc})}));
vi.mock('@/lib/communities/activity',()=>({currentCommunityVisit:()=>null}));
vi.mock('@/lib/communities/celebration-audio',()=>({prepareCelebrationAudio:vi.fn()}));
vi.mock('@/components/events/rsvp-celebration',()=>({RsvpCelebration:({eventTitle}:{eventTitle:string})=><div>Joined {eventTitle}</div>}));
vi.mock('@/components/questionnaire',()=>({QuestionnaireFlow:()=>null}));
import {useRsvpActions} from '@/components/events/rsvp-button';
import {CommunityRsvpProvider,CommunityRsvpChoice} from '@/components/events/community-rsvp';
function Actions(){const {handleInterested}=useRsvpActions('event',true);return <><CommunityRsvpChoice/><button onClick={handleInterested}>Interested</button></>;}
function renderActions(){render(<CommunityRsvpProvider eventSlug="event" community={{slug:'professionals',name:'Dalat Professionals'}} initiallyJoin><Actions/></CommunityRsvpProvider>);}
beforeEach(()=>{rpc.mockReset();refresh.mockClear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
