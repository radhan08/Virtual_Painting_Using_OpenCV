from flask import Flask, render_template, Response, jsonify
import cv2
import mediapipe as mp

app = Flask(__name__)

# MediaPipe setup
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7)
mp_draw = mp.solutions.drawing_utils

# Capture from webcam
cap = cv2.VideoCapture(0)

# Global shared state
cursor_x, cursor_y = 0, 0
draw_mode = False
eraser_mode = False
show_cursor = False
frame = None

def gen_frames():
    global cursor_x, cursor_y, draw_mode, show_cursor, frame, eraser_mode  # ← ADD eraser_mode

    while True:
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)

        h, w, _ = frame.shape
        draw_mode = False
        show_cursor = False
        eraser_mode = False  # Reset each frame

        if results.multi_hand_landmarks:
            for handLms in results.multi_hand_landmarks:
                lm = handLms.landmark

                ix = int(lm[8].x * w)
                iy = int(lm[8].y * h)

                index_up = lm[8].y < lm[6].y
                middle_up = lm[12].y < lm[10].y
                ring_up = lm[16].y < lm[14].y
                pinky_up = lm[20].y < lm[18].y

                if index_up and middle_up and not ring_up and not pinky_up:
                    show_cursor = True
                    draw_mode = False
                    cursor_x, cursor_y = ix, iy

                elif index_up and not middle_up and not ring_up and not pinky_up:
                    show_cursor = True
                    draw_mode = True
                    eraser_mode = False
                    cursor_x, cursor_y = ix, iy
                    print("🎨 Drawing mode active")


                elif index_up and middle_up and ring_up and pinky_up:
                    show_cursor = True
                    draw_mode = False
                    eraser_mode = True  # Eraser mode
                    cursor_x, cursor_y = ix, iy

                mp_draw.draw_landmarks(frame, handLms, mp_hands.HAND_CONNECTIONS)

        _, buffer = cv2.imencode('.jpg', frame)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video')
def video():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/finger_position')
def finger_position():
    global cursor_x, cursor_y, draw_mode, show_cursor, frame, eraser_mode  # Add eraser_mode

    if frame is None:
        return jsonify({'x': 0, 'y': 0, 'draw': False, 'cursor': False, 'eraser': False})

    h, w, _ = frame.shape
    norm_x = cursor_x / w
    norm_y = cursor_y / h

    return jsonify({
        'x': norm_x,
        'y': norm_y,
        'draw': draw_mode,
        'cursor': show_cursor,
        'eraser': eraser_mode  # ← critical
    })



if __name__ == '__main__':
    app.run(debug=True)
