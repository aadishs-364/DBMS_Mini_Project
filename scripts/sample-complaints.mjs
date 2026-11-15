// Sample complaints for the demo. They are filed oldest first through
// fn_file_complaint(), so the duplicates below are merged by the database
// exactly as they would be when real citizens file them.
//
// then: what happens to the complaint after filing
//   'assign'   -> assigned to the department's officer
//   'progress' -> assigned, then marked in progress
//   'resolve'  -> assigned, worked on and resolved

export const SAMPLE_COMPLAINTS = [
  // --- Ward 12: the same pothole reported three times ---
  { by: 'aarav@example.test', ward: 12, hoursAgo: 150,
    title: 'Deep pothole near metro pillar 64 on 100 Feet Road',
    description: 'A big pothole has formed on 100 Feet Road right after metro pillar 64. Two-wheelers swerve suddenly to avoid it and one rider fell yesterday evening.' },
  { by: 'rohan@example.test', ward: 12, hoursAgo: 146,
    title: 'Large pothole on 100 Feet Road near metro pillar 64',
    description: 'There is a deep pothole on 100 Feet Road just after metro pillar 64. Bikes are swerving to avoid it and a rider fell there. It needs to be filled.' },
  { by: 'sneha@example.test', ward: 12, hoursAgo: 110,
    title: 'Pothole at metro pillar 64, 100 Feet Road, causing accidents',
    description: 'Deep pothole on 100 Feet Road beside metro pillar 64. Two-wheelers swerve at the last moment and riders have fallen. Please repair the road.' },

  // --- Ward 68: streetlights out, reported three times ---
  { by: 'divya@example.test', ward: 68, hoursAgo: 60, then: 'progress',
    title: 'Streetlights not working on 80 Feet Road near Sony signal',
    description: 'All the streetlights on 80 Feet Road between Sony signal and the bus stop have been off for three nights. The stretch is completely dark and unsafe to walk.' },
  { by: 'nikhil@example.test', ward: 68, hoursAgo: 55,
    title: 'Streetlights off on 80 Feet Road near Sony signal for three nights',
    description: 'The streetlights on 80 Feet Road from Sony signal to the bus stop are not working. It has been completely dark for three nights and feels unsafe.' },
  { by: 'lakshmi@example.test', ward: 68, hoursAgo: 30,
    title: '80 Feet Road near Sony signal is dark, streetlights not working',
    description: 'No streetlights are working on 80 Feet Road near Sony signal up to the bus stop. The road is dark at night and people are afraid to walk there.' },

  // --- Ward 45: burst water line, reported twice ---
  { by: 'sneha@example.test', ward: 45, hoursAgo: 40,
    title: 'Water pipeline burst on Sampige Road 8th Cross',
    description: 'The drinking water pipeline has burst at 8th Cross on Sampige Road. Water has been flowing onto the road since morning and houses nearby have no supply.' },
  { by: 'aarav@example.test', ward: 45, hoursAgo: 38,
    title: 'Burst water pipe at 8th Cross, Sampige Road',
    description: 'A drinking water pipe burst at Sampige Road 8th Cross. Water is flowing on the road since morning and nearby houses are not getting any supply.' },

  // --- Ward 81: sewage overflow, reported twice ---
  { by: 'nikhil@example.test', ward: 81, hoursAgo: 20, then: 'assign',
    title: 'Sewage overflowing from manhole near ITPL main gate',
    description: 'The manhole on the footpath near ITPL main gate is blocked and sewage is overflowing onto the road. The smell is very bad and people have to walk through dirty water.' },
  { by: 'divya@example.test', ward: 81, hoursAgo: 16,
    title: 'Manhole overflowing with sewage near ITPL main gate',
    description: 'Sewage is overflowing from the blocked manhole on the footpath near ITPL main gate. There is a very bad smell and dirty water all over the road.' },

  // --- Ward 24: garbage not collected, reported twice ---
  { by: 'lakshmi@example.test', ward: 24, hoursAgo: 90, then: 'resolve',
    title: 'Garbage not collected near 4th Block park for a week',
    description: 'Garbage has not been collected from the corner next to 4th Block park for a week. The pile keeps growing and stray dogs are tearing the bags open.' },
  { by: 'rohan@example.test', ward: 24, hoursAgo: 84,
    title: 'Garbage piling up at the corner of 4th Block park',
    description: 'No garbage collection near 4th Block park for about a week. The pile at the corner is growing and stray dogs are tearing open the bags.' },

  // --- Single reports ---
  { by: 'aarav@example.test', ward: 12, hoursAgo: 70, then: 'assign',
    title: 'Footpath slabs broken outside the CMH Road post office',
    description: 'Several footpath slabs outside the post office on CMH Road are broken and the drain below is open. An elderly person tripped there last week.' },
  { by: 'rohan@example.test', ward: 12, hoursAgo: 14,
    title: 'Electric pole sparking near 12th Main junction',
    description: 'The electric pole at 12th Main junction is sparking whenever it rains and a wire is hanging low over the footpath. Children walk past it to school.' },
  { by: 'divya@example.test', ward: 68, hoursAgo: 26, then: 'progress',
    title: 'Construction debris dumped on 5th Block service road',
    description: 'A truckload of construction debris has been dumped on the service road in 5th Block. It blocks half the road and nobody has come to clear it.' },
  { by: 'sneha@example.test', ward: 45, hoursAgo: 100, then: 'resolve',
    title: 'Streetlight flickering outside Malleshwaram railway station',
    description: 'The streetlight outside the railway station entrance keeps flickering and goes off for minutes at a time, leaving the auto stand in darkness.' },
  { by: 'lakshmi@example.test', ward: 24, hoursAgo: 8,
    title: 'Low water pressure in 9th Block for two days',
    description: 'Water comes with very low pressure in 9th Block since two days. The overhead tank does not fill and we have had to order a tanker.' },
  { by: 'nikhil@example.test', ward: 81, hoursAgo: 50,
    title: 'Road caved in near Hope Farm junction',
    description: 'A part of the road near Hope Farm junction has caved in and left a wide pit. Cars are moving in a single lane and traffic is backed up every evening.' },
  { by: 'divya@example.test', ward: 68, hoursAgo: 5,
    title: 'Garbage being burnt behind the 6th Block market',
    description: 'Someone burns a heap of waste behind the 6th Block market every morning. The smoke enters the houses nearby and it is hard to breathe.' },
  { by: 'aarav@example.test', ward: 12, hoursAgo: 3,
    title: 'Drain blocked and dirty water on Double Road',
    description: 'The roadside drain on Double Road is blocked and dirty water with a foul smell has collected near the bus stop since last night.' },

  // --- New duplicate group: illegal dumping, reported twice ---
  { by: 'aarav@example.test', ward: 12, hoursAgo: 18,
    title: 'Building waste dumped beside 3rd Main playground',
    description: 'Large piles of broken bricks and building waste have been dumped beside the 3rd Main playground. Children cannot use the entrance and dust blows into nearby homes.' },
  { by: 'rohan@example.test', ward: 12, hoursAgo: 15,
    title: 'Construction rubble blocking 3rd Main playground entrance',
    description: 'Construction rubble and broken bricks are blocking the entrance to the 3rd Main playground. Dust is blowing into houses and children cannot enter safely.' },

  // --- Additional single reports ---
  { by: 'sneha@example.test', ward: 45, hoursAgo: 12,
    title: 'Traffic signal stuck red at 5th Cross junction',
    description: 'The traffic signal at the 5th Cross junction remains red in every direction and vehicles are backing up through the intersection.' },
  { by: 'lakshmi@example.test', ward: 24, hoursAgo: 10,
    title: 'Open drain cover outside community hall',
    description: 'The drain cover outside the community hall is missing and the open hole is difficult to see after dark. Please place a safe cover before someone falls.' },
  { by: 'nikhil@example.test', ward: 81, hoursAgo: 9,
    title: 'Bus shelter roof leaking near Whitefield gate',
    description: 'Rainwater pours through the roof of the bus shelter near Whitefield gate and passengers have to stand in the road while waiting.' },
  { by: 'divya@example.test', ward: 68, hoursAgo: 7,
    title: 'Tree branch blocking the cycle lane',
    description: 'A large fallen tree branch is blocking the cycle lane beside the lake and cyclists are forced into moving traffic.' },
  { by: 'aarav@example.test', ward: 12, hoursAgo: 6,
    title: 'Public tap leaking beside the health centre',
    description: 'The public water tap beside the health centre has been leaking continuously and water is collecting around the entrance.' },
  { by: 'rohan@example.test', ward: 12, hoursAgo: 4,
    title: 'Footpath tiles loose near the library',
    description: 'Several footpath tiles near the library are loose and uneven. People have stumbled there while walking to the entrance.' },
  { by: 'sneha@example.test', ward: 45, hoursAgo: 2,
    title: 'Noisy generator operating late beside apartments',
    description: 'A commercial generator beside the apartments runs late into the night and the constant noise is disturbing residents.' },
  { by: 'lakshmi@example.test', ward: 24, hoursAgo: 1,
    title: 'Park drinking water fountain not working',
    description: 'The drinking water fountain in the neighbourhood park has stopped working and the tap produces no water.' },
];
