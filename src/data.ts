import type { TreeNode, RetentionPoint } from './types';

export const DEFAULT_TREE: TreeNode = {
  id: 'root', label: 'Fit4Me', type: 'root',
  c: [
    {
      id: 'navp', label: 'Primary nav bar', sublabel: 'Plan · Workouts · Fasting · Me · More', type: 'nav', c: [
        {
          id: 'plan', label: 'Plan', type: 'tab', b: 'plan', c: [
            { id: 'ai',   label: 'AI assistant block', sublabel: 'ask your coach', b: 'plan' },
            {
              id: 'p28', label: '28-day program', b: 'plan', c: [
                {
                  id: 'days', label: 'Day cells 1–28', b: 'plan', c: [
                    { id: 'dc', label: 'completed', sublabel: 'past',   b: 'plan' },
                    { id: 'da', label: 'active',    sublabel: 'today',  b: 'plan' },
                    { id: 'dl', label: 'locked',    sublabel: 'future', b: 'plan' },
                  ],
                },
                { id: 'tapd', label: 'Tap day → Day detail', b: 'plan' },
              ],
            },
            {
              id: 'dday', label: 'Day detail', b: 'plan', c: [
                { id: 'tl',   label: 'Task list',                b: 'plan' },
                { id: 'cs',   label: 'Completion status / task', b: 'plan' },
                { id: 'prgs', label: 'Progress summary',         b: 'plan' },
              ],
            },
          ],
        },
        {
          id: 'wkt', label: 'Workouts', type: 'tab', b: 'workouts', c: [
            {
              id: 'cats', label: 'Categories', b: 'workouts', c: [
                { id: 'ch', label: 'Fitness at home', b: 'workouts' },
                { id: 'cw', label: 'Wall Pilates',    b: 'workouts' },
                { id: 'ca', label: 'Asian Pilates',   b: 'workouts' },
                { id: 'cx', label: '...',             b: 'workouts' },
              ],
            },
            {
              id: 'wd', label: 'Workout detail', sublabel: 'category → list → detail', b: 'workouts', c: [
                { id: 'wds', label: 'Description',           b: 'workouts' },
                { id: 'wdu', label: 'Duration / level',      b: 'workouts' },
                { id: 'wex', label: 'Exercise list → Start', b: 'workouts' },
              ],
            },
          ],
        },
        { id: 'sc', label: 'Challenges', type: 'tab', b: 'secondary' },
        {
          id: 'me', label: 'Me', type: 'tab', b: 'me', c: [
            { id: 'mst', label: 'Statistics', b: 'me' },
            {
              id: 'mse', label: 'Settings', b: 'me', c: [
                {
                  id: 'mac', label: 'Account', b: 'me', c: [
                    { id: 'mav', label: 'Avatar / name',    b: 'me' },
                    { id: 'mem', label: 'Email',            sublabel: '+ add if missing', b: 'me' },
                    { id: 'mlu', label: 'Language / Units', b: 'me' },
                    { id: 'mlo', label: 'Log out',          b: 'me' },
                    { id: 'mda', label: 'Delete account',   b: 'me' },
                  ],
                },
                {
                  id: 'mpd', label: 'Personal details', b: 'me', c: [
                    { id: 'mbd', label: 'Body data', sublabel: 'weight · height · age',    b: 'me' },
                    { id: 'mgo', label: 'Goals',     sublabel: 'target weight · activity', b: 'me' },
                  ],
                },
                { id: 'mn',  label: 'Nutrition',     b: 'me' },
                { id: 'mno', label: 'Notifications', b: 'me' },
                {
                  id: 'mhe', label: 'Help', b: 'me', c: [
                    { id: 'mfq', label: 'FAQ',    b: 'me' },
                    {
                      id: 'msp', label: 'Support', sublabel: 'email', b: 'me', c: [
                        { id: 'mms', label: 'Manage subscription', b: 'me' },
                      ],
                    },
                    { id: 'mle', label: 'Legal', sublabel: 'Privacy · Terms', b: 'me' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'more', label: 'More', type: 'tab', b: 'more', c: [
            { id: 'mora', label: 'Opens secondary nav', b: 'more' },
          ],
        },
      ],
    },
    {
      id: 'navs', label: 'Secondary nav bar', type: 'nav', b: 'secondary', c: [
        { id: 'sb',   label: '← Back',   b: 'secondary' },
        { id: 'sw',   label: 'Workouts', b: 'secondary' },
        { id: 'sm',   label: 'Meals',    b: 'secondary' },
        {
          id: 'fast', label: 'Fasting', type: 'tab', b: 'fasting', c: [
            { id: 'ft', label: 'Active fast timer', b: 'fasting' },
            { id: 'fc', label: 'Start / stop fast', b: 'fasting' },
            { id: 'fp', label: 'Protocol selector', sublabel: '16:8 · 18:6 · 24h…', b: 'fasting' },
            { id: 'fh', label: 'History',           b: 'fasting' },
          ],
        },
      ],
    },
  ],
};

export const RETENTION_DATA: RetentionPoint[] = [
  { pct: 100,  s: 'D1'    },
  { pct: 58.4, s: '2d'    },
  { pct: 42.0, s: '3d'    },
  { pct: 33.3, s: '4d'    },
  { pct: 28.0, s: '5d'    },
  { pct: 24.1, s: '6-10'  },
  { pct: 13.5, s: '11-15' },
  { pct: 8.83, s: '16-20' },
  { pct: 6.10, s: '21-28' },
];
