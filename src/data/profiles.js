export const healthProfiles = {
  asthmatic: {
    label: "Asthmatic",
    tone: "High caution",
    copy: "Short PM2.5 and ozone spikes matter more for you than the city average, so the hourly forecast should guide when you travel, exercise, and ventilate rooms.",
    actions: [
      "Use an N95 or equivalent when outdoor travel overlaps with the daily AQI peak.",
      "Keep quick-relief medication accessible during commuting and evening exposure.",
      "Move workouts indoors when AQI remains above 150 for several hours.",
    ],
  },
  elderly: {
    label: "Elderly",
    tone: "Protective mode",
    copy: "Long overnight pollution episodes can increase cardio-respiratory stress. Focus on the cleanest time band in the forecast and reduce exertion near roads or smoke clusters.",
    actions: [
      "Shift walks and errands to the cleanest forecast window.",
      "Use a filtered room or purifier when AQI remains high overnight.",
      "Avoid traffic corridors and recent citizen-reported hotspots.",
    ],
  },
  child: {
    label: "Child",
    tone: "School-day caution",
    copy: "Children breathe more air relative to body weight and are more sensitive during outdoor play. Use the AQI trend to decide whether sports and recess should be shortened or moved indoors.",
    actions: [
      "Reduce high-intensity outdoor play when AQI enters the poor range.",
      "Prefer the lowest forecast window for school commute and play.",
      "Watch for cough, throat irritation, or unusual fatigue after exposure.",
    ],
  },
  outdoor_worker: {
    label: "Outdoor worker",
    tone: "Exposure management",
    copy: "Cumulative dose matters as much as the peak AQI. Break timing, route choice, and protective gear can materially reduce your total exposure over the day.",
    actions: [
      "Schedule the heaviest tasks into the lowest forecast band.",
      "Use fit-checked filtration masks for dust, traffic, and smoke-heavy work.",
      "Rotate teams away from community-reported hotspots when possible.",
    ],
  },
  healthy_adult: {
    label: "Healthy adult",
    tone: "Moderate caution",
    copy: "You may tolerate moderate AQI better, but prolonged exertion during high pollution still adds respiratory load. Use the city trend before planning long runs or outdoor activity.",
    actions: [
      "Shorten strenuous outdoor exercise when AQI climbs above 150.",
      "Avoid visible smoke plumes even if the city average looks acceptable.",
      "Ventilate indoor spaces during the cleanest forecast period instead of all day.",
    ],
  },
};
