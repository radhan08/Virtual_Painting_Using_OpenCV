import cv2
import mediapipe as mp

class HandTracker:
    def __init__(self, max_num_hands=1, detection_confidence=0.7, tracking_confidence=0.7):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            max_num_hands=max_num_hands,
            min_detection_confidence=detection_confidence,
            min_tracking_confidence=tracking_confidence
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.results = None
        self.hand_label = 'Right'  # Default; updated dynamically if needed

    def process(self, img):
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        self.results = self.hands.process(rgb)
        return self.results

    def draw_hands(self, img):
        if self.results and self.results.multi_hand_landmarks:
            for hand_landmarks in self.results.multi_hand_landmarks:
                self.mp_draw.draw_landmarks(img, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)
        return img

    def get_landmark_positions(self, img):
        landmark_list = []
        if self.results and self.results.multi_hand_landmarks:
            hand_landmarks = self.results.multi_hand_landmarks[0]  # Assuming single hand
            h, w, _ = img.shape
            for id, lm in enumerate(hand_landmarks.landmark):
                cx, cy = int(lm.x * w), int(lm.y * h)
                landmark_list.append((id, cx, cy))

            # Update hand label if available
            if self.results.multi_handedness:
                self.hand_label = self.results.multi_handedness[0].classification[0].label  # 'Left' or 'Right'

        return landmark_list

    def fingers_up(self, landmarks):
        tips = [4, 8, 12, 16, 20]
        fingers = []

        # Thumb logic
        if self.hand_label == 'Right':
            fingers.append(1 if landmarks[tips[0]][1] > landmarks[tips[0] - 1][1] else 0)
        else:
            fingers.append(1 if landmarks[tips[0]][1] < landmarks[tips[0] - 1][1] else 0)

        # Fingers: index to pinky
        for i in range(1, 5):
            fingers.append(1 if landmarks[tips[i]][2] < landmarks[tips[i] - 2][2] else 0)

        return fingers
