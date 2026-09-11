import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import en from '@/messages/en.json';
vi.mock('next-intl',()=>({useTranslations:()=> (key:string, values?:{count:number})=>en.notifications[key as keyof typeof en.notifications]?.replace('{count}',String(values?.count))}));
vi.mock('@/lib/hooks/use-push-notifications',()=>({usePushNotifications:()=>({permission:'granted',isSubscribed:true,isLoading:false,isSupported:true,isIOSSafari:false,subscribe:vi.fn(),unsubscribe:vi.fn()})}));
vi.mock('@/lib/haptics',()=>({triggerHaptic:vi.fn()}));
import {NotificationSettings} from './notification-settings';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('sends an explicit POST and distinguishes accepted delivery from visible alerts',async()=>{
 const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('test-push')?{result:{sent:1,failed:0}}:{mode:'sound_and_vibration'}}));
 vi.stubGlobal('fetch',fetcher);
 render(<NotificationSettings/>);
 fireEvent.click(await screen.findByRole('button',{name:en.notifications.testButton}));
 await screen.findByText(en.notifications.testSent.replace('{count}','1'));
 expect(fetcher).toHaveBeenCalledWith('/api/test-push',{method:'POST'});
});
it('shows a recovery message when no device accepts the test',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mode:'sound_and_vibration',result:{sent:0,failed:1}})})));
 render(<NotificationSettings/>);
 fireEvent.click(await screen.findByRole('button',{name:en.notifications.testButton}));
 await screen.findByText(en.notifications.testNoDevice);
});
